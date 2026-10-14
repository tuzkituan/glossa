// Translate the draft in the focused text box before sending.
import { languageName, sameLanguage } from './languages';
import { send } from './messaging';
import type { Settings } from './settings';
import type { SiteAdapter } from './sites';
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
    target = (await incomingLanguage(site, source)) ?? settings.replyLang;
  }
  if (source && sameLanguage(source, target)) {
    toast(`Already in ${languageName(target)}`, anchor);
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
