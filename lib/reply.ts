// Translate the draft in the focused text box before sending.
import { languageName, sameLanguage } from './languages';
import { send } from './messaging';
import type { Settings } from './settings';
import type { SiteAdapter } from './sites';
import { segments, type Segment } from './format';
import { readableText } from './text';
import { toast } from './ui/overlay';

type Editable = HTMLTextAreaElement | HTMLInputElement | HTMLElement;

function deepActiveElement(): Element | null {
  let a = document.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  return a;
}

export function focusedEditable(): Editable | null {
  const el = deepActiveElement();
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && /^(text|search|)$/.test(el.type)) return el;
  if (el instanceof HTMLElement && el.isContentEditable) {
    let root = el;
    while (root.parentElement?.isContentEditable) root = root.parentElement;
    return root;
  }
  return null;
}

function readText(el: Editable): string {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : el.innerText;
}

/** Replace through the editing pipeline so React/Lexical editors see it and Ctrl+Z undoes it. */
function replaceText(el: Editable, text: string) {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.select();
    if (!document.execCommand('insertText', false, text)) {
      el.setRangeText(text, 0, el.value.length, 'end');
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
    return;
  }
  document.execCommand('selectAll');
  document.execCommand('insertText', false, text);
}

/** Language the other person writes in, from their latest messages. */
async function incomingLanguage(site: SiteAdapter, draftLang: string): Promise<string | null> {
  const incoming = site
    .messages(document)
    .filter((el) => !site.isOutgoing(el))
    .slice(-5)
    .reverse();
  let sawDraftLang = false;
  for (const el of incoming) {
    const text = readableText(el);
    if (text.length < 2) continue;
    const res = await send({ type: 'detect', text });
    if (!res.ok || res.confidence < 0.5) continue;
    // Some layouts can't tell my messages apart; prefer a language other than my draft's.
    if (!sameLanguage(res.lang, draftLang)) return res.lang;
    sawDraftLang = true;
  }
  return sawDraftLang ? draftLang : null;
}

/**
 * Rich text boxes: replace only the runs of words between chips, so @mentions and other
 * non-editable pieces survive. Each run goes through insertText (last run first, so earlier
 * ranges stay valid). Returns how many edits were made, for undo.
 */
function replaceRuns(el: HTMLElement, segs: Segment[], texts: string[]): number {
  el.focus();
  const sel = window.getSelection()!;
  let edits = 0;
  for (let i = segs.length - 1; i >= 0; i--) {
    const { nodes, text } = segs[i]!;
    const first = nodes[0]!;
    const last = nodes.at(-1)!;
    if (!first.isConnected || !last.isConnected) continue;
    const lead = /^\s*/.exec(text)![0];
    const trail = /\s*$/.exec(text)![0];
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(last, last.length);
    sel.removeAllRanges();
    sel.addRange(range);
    if (document.execCommand('insertText', false, lead + texts[i]!.trim() + trail)) edits++;
  }
  sel.collapse(el, el.childNodes.length);
  return edits;
}

export async function translateDraft(
  el: Editable,
  settings: Settings,
  site: SiteAdapter | undefined,
  openSettings: (pair?: [string, string]) => void,
) {
  const text = readText(el).trim();
  if (!text) return;
  const anchor = el.getBoundingClientRect();
  toast('Translating…', anchor, undefined, 0);

  const det = await send({ type: 'detect', text });
  if (!det.ok) {
    toast(det.message, anchor, { label: 'Settings', run: () => openSettings() });
    return;
  }
  const source = det.lang === 'und' ? undefined : det.lang;

  let target = settings.replyLang;
  if (settings.replyMode === 'match' && site && source) {
    const theirs = await incomingLanguage(site, source);
    // They write in my draft's language too: translating into it would do nothing,
    // and asking to translate means I want another language, so use the reply language.
    if (theirs && !sameLanguage(theirs, source)) target = theirs;
  }
  if (source && sameLanguage(source, target)) {
    toast(`Already in ${languageName(target)}`, anchor);
    return;
  }

  // Rich editors with chips: translate run by run and keep the chips.
  if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) && source) {
    const segs = segments(el);
    const many = await send({ type: 'translate-many', texts: segs.map((x) => x.text), source, target });
    if (!many.ok) {
      const pair: [string, string] | undefined =
        many.source && many.target ? [many.source, many.target] : undefined;
      toast(many.message, anchor, { label: 'Settings', run: () => openSettings(pair) }, 6000);
      return;
    }
    const edits = replaceRuns(el, segs, many.texts);
    toast(`Translated to ${languageName(target)}`, anchor, {
      label: 'Undo',
      run: () => {
        el.focus();
        for (let i = 0; i < edits; i++) document.execCommand('undo');
      },
    }, 6000);
    return;
  }

  const res = await send({ type: 'translate', text, source, target });
  if (!res.ok) {
    const pair: [string, string] | undefined = res.source && res.target ? [res.source, res.target] : undefined;
    toast(res.message, anchor, { label: 'Settings', run: () => openSettings(pair) }, 6000);
    return;
  }
  if (res.skipped) {
    toast(`Already in ${languageName(target)}`, anchor);
    return;
  }
  replaceText(el, res.text);
  toast(`Translated to ${languageName(target)} · Ctrl+Z to undo`, anchor);
}
