// Floating UI for content scripts: selection button, translation card, toasts.
// Lives in a closed shadow root so page CSS can't reach it.
import { languageName, languageOptions } from '../languages';
import type { TranslateResponse } from '../messaging';

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.layer {
  --bg: #ffffff; --fg: #1d1f23; --muted: #6a7079; --line: #e3e5e8; --accent: #2f6fde;
  --shadow: 0 8px 28px rgba(0,0,0,.18), 0 1px 3px rgba(0,0,0,.08);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--fg);
}
@media (prefers-color-scheme: dark) {
  .layer { --bg: #24272c; --fg: #e8eaed; --muted: #9aa0a8; --line: #3a3e45; --accent: #7aa7ff;
    --shadow: 0 8px 28px rgba(0,0,0,.5); }
}
.btn {
  position: fixed; z-index: 2147483647; width: 28px; height: 28px; border-radius: 50%;
  border: 1px solid var(--line); background: var(--bg); color: var(--accent); box-shadow: var(--shadow);
  display: grid; place-items: center; cursor: pointer; padding: 0;
}
.btn:hover { border-color: var(--accent); }
.card {
  position: fixed; z-index: 2147483647; width: min(380px, calc(100vw - 16px));
  background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow);
  padding: 10px 12px 8px;
}
.head { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; margin-bottom: 6px; }
.head select {
  font: inherit; color: var(--fg); background: transparent; border: 1px solid var(--line);
  border-radius: 6px; padding: 1px 4px; margin-left: auto;
}
.body { white-space: pre-wrap; word-break: break-word; max-height: 50vh; overflow: auto; user-select: text; }
.body.muted { color: var(--muted); }
.actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
.actions button {
  font: inherit; font-size: 12px; color: var(--accent); background: none; border: none; cursor: pointer; padding: 2px 4px;
}
.actions button:hover { text-decoration: underline; }
.toast {
  position: fixed; z-index: 2147483647; max-width: min(360px, calc(100vw - 16px));
  background: var(--fg); color: var(--bg); border-radius: 8px; padding: 7px 12px; font-size: 13px;
  box-shadow: var(--shadow); display: flex; gap: 10px; align-items: center;
}
.toast button { font: inherit; color: inherit; background: none; border: none; text-decoration: underline; cursor: pointer; padding: 0; }
`;

const ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h9M8.5 3v2M6 5c.6 3.2 2.8 5.8 6 7"/><path d="M11 5c-.8 3.6-3.3 6.4-7 8"/><path d="M13 21l4-9 4 9M14.4 18h5.2"/></svg>`;

let host: HTMLElement | null = null;
let layer: HTMLDivElement;

function root(): HTMLDivElement {
  if (!host || !host.isConnected) {
    host = document.createElement('glossa-overlay');
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>${CSS}</style><div class="layer"></div>`;
    layer = shadow.querySelector('.layer')!;
    document.documentElement.append(host);
  }
  return layer;
}

/** True when the event happened inside Glossa's own UI. */
export function isOwnEvent(e: Event): boolean {
  return !!host && e.composedPath().includes(host);
}

function place(el: HTMLElement, anchor: DOMRect, gap = 8) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = Math.min(Math.max(8, anchor.left), window.innerWidth - w - 8);
  let top = anchor.bottom + gap;
  if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.top - h - gap);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

let button: HTMLButtonElement | null = null;
let card: HTMLDivElement | null = null;

export function hidePopups() {
  button?.remove();
  card?.remove();
  button = card = null;
}

export function showButton(anchor: DOMRect, onClick: () => void) {
  hidePopups();
  button = document.createElement('button');
  button.className = 'btn';
  button.title = 'Translate (Glossa)';
  button.innerHTML = ICON;
  button.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
  button.addEventListener('click', onClick);
  root().append(button);
  button.style.left = `${Math.min(anchor.right + 4, window.innerWidth - 36)}px`;
  button.style.top = `${Math.max(4, anchor.top - 34)}px`;
}

export interface CardHandlers {
  onTargetChange: (target: string) => void;
  onOpenSettings: (pair?: [string, string]) => void;
}

export function showCard(anchor: DOMRect, target: string, handlers: CardHandlers) {
  hidePopups();
  card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="head"><span class="from">Translating…</span>
      <select aria-label="Translate into">${languageOptions(target)}</select></div>
    <div class="body muted">…</div>
    <div class="actions"></div>`;
  card.querySelector('select')!.addEventListener('change', (e) =>
    handlers.onTargetChange((e.target as HTMLSelectElement).value),
  );
  root().append(card);
  place(card, anchor);
  return {
    update(res: TranslateResponse) {
      if (!card) return;
      const from = card.querySelector('.from')!;
      const body = card.querySelector<HTMLElement>('.body')!;
      const actions = card.querySelector('.actions')!;
      actions.replaceChildren();
      if (res.ok) {
        from.textContent = res.source === 'und' ? '' : `From ${languageName(res.source)}`;
        body.textContent = res.skipped === 'same-language' ? `Already in ${languageName(res.target)}.` : res.text;
        body.classList.toggle('muted', !!res.skipped);
        if (!res.skipped) {
          const copy = document.createElement('button');
          copy.textContent = 'Copy';
          copy.addEventListener('click', async () => {
            await navigator.clipboard.writeText(res.text);
            copy.textContent = 'Copied';
          });
          actions.append(copy);
        }
      } else {
        from.textContent = '';
        body.textContent = res.message;
        body.classList.add('muted');
        if (res.code === 'needs-download' || res.code === 'no-api') {
          const open = document.createElement('button');
          open.textContent = 'Open Glossa settings';
          const pair: [string, string] | undefined =
            res.source && res.target ? [res.source, res.target] : undefined;
          open.addEventListener('click', () => handlers.onOpenSettings(pair));
          actions.append(open);
        }
      }
      place(card, anchor);
    },
  };
}

let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;

export function toast(
  message: string,
  near?: DOMRect,
  action?: { label: string; run: () => void },
  ms = 3500,
) {
  toastEl?.remove();
  clearTimeout(toastTimer);
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.append(message);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.addEventListener('click', action.run);
    toastEl.append(b);
  }
  root().append(toastEl);
  const anchor = near ?? new DOMRect(window.innerWidth / 2 - 120, window.innerHeight - 80, 240, 0);
  const w = toastEl.offsetWidth;
  toastEl.style.left = `${Math.min(Math.max(8, anchor.left), window.innerWidth - w - 8)}px`;
  toastEl.style.top = `${Math.max(8, anchor.top - toastEl.offsetHeight - 8)}px`;
  if (ms > 0) {
    const el = toastEl;
    toastTimer = window.setTimeout(() => el.remove(), ms);
  }
}
