// Adds a Translate button under incoming foreign-language chat messages.
// Clicking it swaps the message text for its translation in place.
import { languageName, likelyLanguage, sameLanguage } from './languages';
import { send, type Failure } from './messaging';
import type { Settings } from './settings';
import type { SiteAdapter } from './sites';
import type { ToolbarButton } from './sites/types';
import { ownAncestors } from './sites/types';
import { segments, translatedCopy } from './format';
import { readableText } from './text';

const CONCURRENCY = 2;

const BUTTON_CSS = `
:host { display: inline-flex; align-items: center; vertical-align: middle; margin-left: 4px; }
:host(.fallback) { display: flex; justify-content: flex-end; margin: 6px 0 0; }
button {
  font: 500 12px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: inherit;
  background: transparent; border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 8px; padding: 0 10px; height: var(--h, 28px); cursor: pointer; opacity: .85; white-space: nowrap;
}
button:hover { opacity: 1; background: color-mix(in srgb, currentColor 10%, transparent); }
button:disabled { cursor: default; opacity: .6; }
`;

interface Entry {
  /** Detected on first click. */
  source?: string;
  target?: string;
  /** The Translate chip. */
  button?: HTMLElement;
  inRow?: boolean;
  /** Copy of the message with its words translated, shown in place of the original. */
  copy?: HTMLElement;
  showing?: boolean;
  busy?: boolean;
  /** The visible bubble around the message, recoloured while translated. */
  bubble?: HTMLElement;
  bubbleColor?: string;
  /** Button in the site's hover toolbar, when the site has one. */
  tool?: ToolbarButton;
}

const COPY = 'data-glossa-copy';

/** Generic guess: the last button after the message whose text is just a count ("👍 2"). */
function guessReactionAnchor(el: HTMLElement, others: HTMLElement[]): HTMLElement | null {
  for (const anc of ownAncestors(el, others, 8)) {
    const chips = [...anc.querySelectorAll<HTMLElement>('[role="button"], button')].filter(
      (c) =>
        !el.contains(c) &&
        el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING &&
        /^[\p{Extended_Pictographic}\p{Emoji_Component}\s]*\d+\s*$/u.test(c.textContent ?? '') &&
        !c.closest('glossa-button'),
    );
    if (chips.length) return chips.at(-1)!;
  }
  return null;
}

const BLUE = 'rgb(66, 133, 244)';

/** Translated-bubble colour: a light blue tint on light bubbles, a darker navy on dark ones. */
function translatedColor(bg: string): string {
  const [r = 0, g = 0, b = 0] = (bg.match(/[\d.]+/g) ?? []).map(Number);
  const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  return dark
    ? `color-mix(in srgb, rgb(8, 22, 56) 55%, ${bg})`
    : `color-mix(in srgb, ${BLUE} 22%, ${bg})`;
}

function opaqueBackground(el: Element): string | null {
  const bg = getComputedStyle(el).backgroundColor;
  return bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg) ? bg : null;
}

/** The outermost element with a background around the message, within its own container. */
function findBubble(el: HTMLElement, others: HTMLElement[]): HTMLElement | null {
  let bubble: HTMLElement | null = opaqueBackground(el) ? el : null;
  let i = 0;
  for (const anc of ownAncestors(el, others, 6)) {
    if (opaqueBackground(anc)) bubble = anc;
    if (++i >= 4) break;
  }
  return bubble;
}

export class MessageButtons {
  private enabled = false;
  private gen = 0;
  /** Text already handled per element; a different text means the message was edited. */
  private done = new WeakMap<HTMLElement, string>();
  private failed = new WeakMap<HTMLElement, number>();
  private pending = new WeakSet<HTMLElement>();
  /** Messages that have a button, with what's known about them. */
  private entries = new Map<HTMLElement, Entry>();
  private queue: HTMLElement[] = [];
  private running = 0;
  private scanTimer = 0;
  private io = new IntersectionObserver(
    (records) => {
      for (const r of records) {
        if (!r.isIntersecting) continue;
        this.io.unobserve(r.target);
        this.queue.push(r.target as HTMLElement);
      }
      this.pump();
    },
    { rootMargin: '300px 0px' },
  );
  private mo = new MutationObserver(() => {
    this.scheduleScan();
    this.scheduleToolbars();
  });
  private toolbarFrame = 0;

  constructor(
    private site: SiteAdapter,
    private settings: () => Settings,
    private onFailure: (f: Failure, clicked?: boolean) => void,
  ) {
    // Theme switches (the site's own toggle flips a class on html/body; or the OS scheme).
    const recolorAll = () => {
      for (const [el, entry] of this.entries) this.recolor(el, entry);
    };
    new MutationObserver(recolorAll).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
    if (document.body) {
      new MutationObserver(recolorAll).observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme'],
      });
    }
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolorAll);
    // Coming back from the settings tab may mean a language pack was just installed.
    window.addEventListener('focus', () => {
      this.gen++;
      this.scheduleScan();
    });
  }

  private get active(): boolean {
    return this.enabled && this.settings().messageButtons[this.site.id];
  }

  setEnabled(on: boolean) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) {
      this.mo.observe(document.body, { childList: true, subtree: true, characterData: true });
      this.scheduleScan();
    } else {
      this.mo.disconnect();
      this.reset();
    }
  }

  /** Remove every button and translation and start over, e.g. after the target language changed. */
  reset() {
    this.io.disconnect();
    for (const [el, entry] of this.entries) this.drop(el, entry);
    this.entries.clear();
    this.queue = [];
    this.done = new WeakMap();
    this.failed = new WeakMap();
    this.pending = new WeakSet();
    if (this.enabled) this.scheduleScan();
  }

  private drop(el: HTMLElement, entry: Entry) {
    entry.button?.remove();
    entry.tool?.root.remove();
    if (entry.bubble && entry.bubble !== el) entry.bubble.style.removeProperty('background-color');
    entry.copy?.remove();
    el.style.removeProperty('display');
  }

  /** Hover toolbars may be built on demand; add our button on the next frame, not after the scan delay. */
  private scheduleToolbars() {
    const toolbar = this.site.toolbar;
    if (!toolbar || this.toolbarFrame) return;
    this.toolbarFrame = requestAnimationFrame(() => {
      this.toolbarFrame = 0;
      for (const [el, entry] of this.entries) {
        if (entry.tool?.root.isConnected || !el.isConnected) continue;
        const slot = toolbar.slot(el);
        if (!slot) continue;
        entry.tool ??= this.createToolButton(el, entry, toolbar.button());
        slot.before(entry.tool.root);
        this.refresh(entry);
      }
    });
  }

  private scheduleScan() {
    if (!this.enabled || this.scanTimer) return;
    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = 0;
      this.scan();
    }, 250);
  }

  private scan() {
    for (const [el, entry] of this.entries) {
      if (el.isConnected) continue;
      this.drop(el, entry);
      this.entries.delete(el);
    }
    const messages = this.messages();
    for (const el of messages) {
      const text = readableText(el);
      if (!text) continue;
      if (this.done.get(el) === text) {
        // The site may have re-rendered and dropped our nodes, or reactions may have appeared.
        const entry = this.entries.get(el);
        if (entry) this.place(el, entry, messages);
        continue;
      }
      if (this.pending.has(el) || this.failed.get(el) === this.gen) continue;
      // Edited message: forget the old button and translation.
      const old = this.entries.get(el);
      if (old) {
        this.drop(el, old);
        this.entries.delete(el);
      }
      this.pending.add(el);
      this.io.observe(el);
    }
  }

  private messages(): HTMLElement[] {
    return this.site.messages(document).filter((el) => !el.closest(`[${COPY}]`));
  }


  private pump() {
    while (this.running < CONCURRENCY && this.queue.length) {
      const el = this.queue.shift()!;
      this.running++;
      this.process(el).finally(() => {
        this.running--;
        this.pending.delete(el);
        this.pump();
      });
    }
  }

  /** Every message gets a button; its language is detected when it's clicked. */
  private async process(el: HTMLElement) {
    if (!this.active || !el.isConnected) return;
    const text = readableText(el);
    if (!text) return;
    this.done.set(el, text);
    const entry: Entry = {};
    this.entries.set(el, entry);
    this.place(el, entry, this.messages());
  }


  /** Put the copy after the message, the toolbar button in the site's toolbar, and the chip by the reactions. */
  private place(el: HTMLElement, entry: Entry, messages: HTMLElement[]) {
    if (entry.copy && !entry.copy.isConnected) el.after(entry.copy);
    if (entry.copy) {
      el.style.display = entry.showing ? 'none' : '';
      entry.copy.style.display = entry.showing ? '' : 'none';
      this.recolor(el, entry);
    }

    const toolbar = this.site.toolbar;
    if (toolbar && !entry.tool?.root.isConnected) {
      const slot = toolbar.slot(el);
      if (slot) {
        entry.tool ??= this.createToolButton(el, entry, toolbar.button());
        slot.before(entry.tool.root);
        this.refresh(entry);
      }
    }

    // Sites with a toolbar button need no chip.
    if (toolbar) return;
    const anchor = this.site.reactionAnchor
      ? this.site.reactionAnchor(el, messages)
      : guessReactionAnchor(el, messages);
    if (entry.button?.isConnected && (entry.inRow || !anchor)) return;
    const button = entry.button ?? this.createChip(el, entry);
    entry.button = button;
    entry.inRow = !!anchor;
    button.classList.toggle('fallback', !anchor);
    if (anchor) {
      // Match the reaction chips' height.
      button.style.setProperty('--h', `${anchor.getBoundingClientRect().height || 28}px`);
      anchor.after(button);
    } else {
      (entry.copy ?? el).after(button);
    }
  }

  /**
   * Colour the bubble for the current theme: drop our override, read the site's own colour
   * (dark or light right now), then blend from that.
   */
  private recolor(el: HTMLElement, entry: Entry) {
    const target = entry.bubble === el ? entry.copy : entry.bubble;
    if (!target) return;
    target.style.removeProperty('background-color');
    if (!entry.showing) return;
    const base = opaqueBackground(target) ?? entry.bubbleColor;
    if (base) target.style.backgroundColor = translatedColor(base);
  }

  /** Translate on first use, then switch between translation and original. */
  private async activate(el: HTMLElement, entry: Entry) {
    if (entry.busy) return;
    if (!entry.copy) {
      entry.busy = true;
      this.refresh(entry);
      const segs = segments(el);
      const res = await this.translateRuns(el, entry, segs.map((s) => s.text));
      entry.busy = false;
      if (!res.ok) {
        this.refresh(entry);
        this.onFailure(res, true);
        return;
      }
      const copy = translatedCopy(el, segs, res.texts);
      copy.setAttribute(COPY, '');
      copy.title = `Translated from ${languageName(entry.source!)} by Glossa`;
      // Recolour the bubble itself rather than the copy, so its shape stays exactly as drawn.
      const bubble = findBubble(el, this.messages());
      if (bubble) {
        entry.bubble = bubble;
        entry.bubbleColor = opaqueBackground(bubble)!;
        if (bubble !== el) copy.style.backgroundColor = 'transparent';
      } else {
        copy.style.backgroundColor = `color-mix(in srgb, ${BLUE} 16%, transparent)`;
        copy.style.borderRadius = '6px';
      }
      entry.copy = copy;
    }
    // Show either the translation or the original, never both.
    entry.showing = !entry.showing;
    this.place(el, entry, this.messages());
    this.refresh(entry);
  }

  /**
   * Detect the message's language, then translate into my language; a message already
   * in my language goes into the reply language instead.
   */
  private async translateRuns(el: HTMLElement, entry: Entry, texts: string[]) {
    const { target, replyLang, languages } = this.settings();
    if (!entry.source) {
      const det = await send({ type: 'detect', text: readableText(el) });
      if (!det.ok) return det;
      if (det.lang === 'und') {
        return { ok: false as const, code: 'uncertain' as const, message: "Couldn't tell which language this is." };
      }
      // Any of my language in it (even mixed with English, "làm gì có milestones"): translate
      // from my language into the reply language; that model passes the English words through
      // untouched. Translating mixed text the other way garbles it. No trace of my language:
      // translate it into my language.
      const mine = det.candidates.find((c) => c.confidence >= 0.15 && sameLanguage(c.lang, target));
      entry.source = mine ? mine.lang : likelyLanguage(det.candidates, [target, replyLang, ...languages], target);
      if (sameLanguage(entry.source, target)) {
        entry.target = replyLang;
        return send({ type: 'translate-many', texts, source: entry.source, target: entry.target });
      }
      entry.target = mine ? replyLang : target;
    }
    entry.target ??= target;
    if (sameLanguage(entry.source, entry.target)) {
      return { ok: false as const, code: 'error' as const, message: `Already in ${languageName(entry.target)}.` };
    }
    return send({ type: 'translate-many', texts, source: entry.source, target: entry.target });
  }

  /** Sync the chip's and toolbar button's labels with the entry's state. */
  private refresh(entry: Entry) {
    const label = entry.busy ? 'Translating…' : entry.showing ? 'Show original' : 'Translate';
    const title = entry.showing
      ? `Translated from ${languageName(entry.source!)}. Show original`
      : 'Translate';
    const chip = entry.button?.shadowRoot?.querySelector('button');
    if (chip) {
      chip.textContent = label;
      chip.title = title;
      chip.disabled = !!entry.busy;
    }
    if (entry.tool) {
      entry.tool.button.setAttribute('aria-label', title);
      entry.tool.button.title = title;
      entry.tool.button.setAttribute('aria-pressed', String(!!entry.showing));
      entry.tool.button.style.opacity = entry.busy ? '.5' : '';
      // Stays tinted while the message shows its translation.
      entry.tool.button.style.background = entry.showing
        ? 'color-mix(in srgb, currentColor 20%, transparent)'
        : '';
    }
  }

  private createChip(el: HTMLElement, entry: Entry): HTMLElement {
    const host = document.createElement('glossa-button');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${BUTTON_CSS}</style><button></button>`;
    shadow.querySelector('button')!.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.activate(el, entry);
    });
    entry.button = host;
    this.refresh(entry);
    return host;
  }

  private createToolButton(el: HTMLElement, entry: Entry, made: ToolbarButton): ToolbarButton {
    made.root.setAttribute('data-glossa', '');
    made.button.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.activate(el, entry);
    });
    return made;
  }
}
