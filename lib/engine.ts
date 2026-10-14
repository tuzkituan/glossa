// Translation logic shared by both backends: Chrome's on-device models (run in the offscreen
// document) and Google Translate (Firefox). Backends only detect and translate plain pieces.
import { EngineError } from './errors';
import { sameLanguage } from './languages';
import type {
  DetectResponse,
  Failure,
  ProofreadRequest,
  ProofreadResponse,
  TranslateManyRequest,
  TranslateManyResponse,
  TranslateRequest,
  TranslateResponse,
} from './messaging';

/** Below this, automatic translation leaves the text alone. */
const AUTO_MIN_CONFIDENCE = 0.5;
const CACHE_SIZE = 500;

export interface Backend {
  /** Ranked guesses, most likely first. */
  detect(text: string): Promise<LanguageDetectionResult[]>;
  /** Translate several plain pieces in one go. */
  translate(texts: string[], source: string, target: string): Promise<string[]>;
  /** Fix spelling and grammar in several plain English pieces. */
  proofread(texts: string[]): Promise<string[]>;
}

let backend: Backend;

export function useBackend(b: Backend) {
  backend = b;
}

function fail(e: unknown): Failure {
  if (e instanceof EngineError) {
    return { ok: false, code: e.code, message: e.message, source: e.source, target: e.target };
  }
  return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
}

const cache = new Map<string, string>();

async function detectAll(text: string): Promise<LanguageDetectionResult[]> {
  return (await backend.detect(text.slice(0, 2000))).filter((r) => r.detectedLanguage !== 'und');
}

async function detectTop(text: string): Promise<LanguageDetectionResult> {
  return (await detectAll(text))[0] ?? { detectedLanguage: 'und', confidence: 0 };
}

export async function detect(text: string): Promise<DetectResponse> {
  try {
    const results = await detectAll(text);
    const top = results[0] ?? { detectedLanguage: 'und', confidence: 0 };
    return {
      ok: true,
      lang: top.detectedLanguage,
      confidence: top.confidence,
      candidates: results.slice(0, 5).map((r) => ({ lang: r.detectedLanguage, confidence: r.confidence })),
    };
  } catch (e) {
    return fail(e);
  }
}

function remember(key: string, value: string) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
}

/** Words the model must not re-case: Tour.GuideButton, camelCase, PRD, snake_case, paths, URLs, @mentions. */
function protectedWords(text: string): string[] {
  const words = new Set<string>();
  for (const raw of text.split(/\s+/)) {
    const word = raw.replace(/^[("'`[{<]+|[)"'`\]}>,;:!?.]+$/g, '');
    if (word.length < 2 || !/\p{L}/u.test(word)) continue;
    const codeLike =
      /\p{Ll}\p{Lu}/u.test(word) || // camelCase / PascalCase inside
      /\p{Lu}.*\p{Lu}/u.test(word) || // GuideButton, PRD
      /\w[._/\\:#-]\w/.test(word) || // Tour.Guide, snake_case, a/b, http://
      /^[@#]/.test(word);
    if (codeLike) words.add(word);
  }
  return [...words];
}

/** A line written entirely in capitals ("TÔI BẢO LÀ KHÔNG") stays in capitals. */
function shouting(text: string): boolean {
  const cased = text.match(/[\p{Lu}\p{Ll}]/gu) ?? [];
  return cased.length >= 2 && cased.every((c) => /\p{Lu}/u.test(c));
}

/** Put back the original casing of protected words the model kept but lowercased. */
function restoreCase(source: string, translated: string): string {
  let out = translated;
  for (const word of protectedWords(source)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu'), word);
  }
  return out;
}

/**
 * Run texts through the backend line by line so line breaks survive, with all uncached
 * lines sent in one call. `finish` adjusts each line's result; code names keep their casing.
 */
async function perLine(
  texts: string[],
  cacheKey: string,
  run: (pieces: string[]) => Promise<string[]>,
  finish: (raw: string, out: string) => string,
): Promise<string[]> {
  const results: (string | undefined)[] = texts.map((t) => {
    const key = `${cacheKey}|${t}`;
    const hit = cache.get(key);
    if (hit !== undefined) remember(key, hit);
    return hit;
  });
  const pending = texts.map((t, i) => (results[i] === undefined ? i : -1)).filter((i) => i >= 0);
  const pieces: string[] = [];
  const layout = pending.map((i) =>
    texts[i]!.split(/(\n+)/).map((p) => {
      if (!p.trim() || /^\n+$/.test(p)) return { raw: p };
      pieces.push(p);
      return { at: pieces.length - 1, raw: p };
    }),
  );
  const done = pieces.length ? await run(pieces) : [];
  pending.forEach((i, n) => {
    const out = layout[n]!.map((part) =>
      part.at === undefined ? part.raw : finish(part.raw, done[part.at] ?? part.raw),
    );
    const result = restoreCase(texts[i]!, out.join(''));
    remember(`${cacheKey}|${texts[i]}`, result);
    results[i] = result;
  });
  return results as string[];
}

/** Translate texts from source to target, keeping all-caps lines in capitals. */
function translateTexts(texts: string[], source: string, target: string): Promise<string[]> {
  return perLine(
    texts,
    `${source}>${target}`,
    (pieces) => backend.translate(pieces, source, target),
    (raw, out) => (shouting(raw) ? out.toLocaleUpperCase(target) : out),
  );
}

export async function translate(req: TranslateRequest): Promise<TranslateResponse> {
  const { text, target, auto } = req;
  try {
    let source = req.source;
    if (!source) {
      const top = await detectTop(text);
      const uncertain = top.detectedLanguage === 'und' || (auto && top.confidence < AUTO_MIN_CONFIDENCE);
      if (uncertain) {
        if (auto) return { ok: true, text, source: 'und', target, skipped: 'uncertain' };
        throw new EngineError('uncertain', "Couldn't tell which language this is.");
      }
      source = top.detectedLanguage;
    }
    if (sameLanguage(source, target)) {
      return { ok: true, text, source, target, skipped: 'same-language' };
    }
    const [result] = await translateTexts([text], source, target);
    return { ok: true, text: result!, source, target };
  } catch (e) {
    return fail(e);
  }
}

export async function translateMany(req: TranslateManyRequest): Promise<TranslateManyResponse> {
  try {
    if (sameLanguage(req.source, req.target)) return { ok: true, texts: req.texts };
    return { ok: true, texts: await translateTexts(req.texts, req.source, req.target) };
  } catch (e) {
    return fail(e);
  }
}

export async function proofread(req: ProofreadRequest): Promise<ProofreadResponse> {
  try {
    const texts = await perLine(
      req.texts,
      'proofread',
      (pieces) => backend.proofread(pieces),
      // Keep the line's own surrounding spaces.
      (raw, out) => /^\s*/.exec(raw)![0] + out.trim() + /\s*$/.exec(raw)![0],
    );
    return { ok: true, texts };
  } catch (e) {
    return fail(e);
  }
}
