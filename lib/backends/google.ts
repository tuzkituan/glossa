// Google Translate's free endpoint (the one its own browser extension uses). Used on Firefox,
// which has no on-device translation API for extensions. Text leaves the device.
import type { Backend } from '../engine';
import { EngineError } from '../errors';

const ENDPOINT = 'https://clients5.google.com/translate_a/t';
/** Google gives no confidence; its guesses on short chat text are often odd ("ok ae ko dc" → Hawaiian). */
const SHORT_TEXT = 25;

const toGoogle: Record<string, string> = { he: 'iw', 'zh-Hant': 'zh-TW', zh: 'zh-CN' };
const fromGoogle: Record<string, string> = { iw: 'he', 'zh-TW': 'zh-Hant', 'zh-CN': 'zh' };

async function call(texts: string[], source: string, target: string): Promise<unknown[]> {
  const url = `${ENDPOINT}?client=dict-chrome-ex&sl=${toGoogle[source] ?? source}&tl=${toGoogle[target] ?? target}`;
  const body = new URLSearchParams();
  for (const t of texts) body.append('q', t);
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', body });
  } catch {
    throw new EngineError('error', "Couldn't reach Google Translate. Check your connection.");
  }
  if (!res.ok) {
    throw new EngineError('error', `Google Translate refused the request (${res.status}). Try again in a minute.`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) throw new EngineError('error', 'Unexpected answer from Google Translate.');
  return data;
}

/** Items are "text" for a fixed source language, or ["text", "detected"] for auto. */
function textOf(item: unknown): string {
  return Array.isArray(item) ? String(item[0] ?? '') : String(item ?? '');
}

export const google: Backend = {
  async detect(text) {
    const [item] = await call([text], 'auto', 'en');
    const lang = Array.isArray(item) ? String(item[1] ?? 'und') : 'und';
    const confidence = text.trim().length >= SHORT_TEXT ? 0.9 : 0.5;
    return [{ detectedLanguage: fromGoogle[lang] ?? lang, confidence }];
  },
  async translate(texts, source, target) {
    // Keep each request a reasonable size.
    const out: string[] = [];
    let batch: string[] = [];
    let size = 0;
    const flush = async () => {
      if (!batch.length) return;
      out.push(...(await call(batch, source, target)).map(textOf));
      batch = [];
      size = 0;
    };
    for (const t of texts) {
      if (size + t.length > 4000) await flush();
      batch.push(t);
      size += t.length;
    }
    await flush();
    return out;
  },
};
