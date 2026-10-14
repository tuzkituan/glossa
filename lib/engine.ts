// Runs in the offscreen document: the Translator API only exists in window contexts.
import { languageName, sameLanguage } from './languages';
import type {
  DetectResponse,
  ErrorCode,
  Failure,
  TranslateManyRequest,
  TranslateManyResponse,
  TranslateRequest,
  TranslateResponse,
} from './messaging';

/** Below this, automatic translation leaves the text alone. */
const AUTO_MIN_CONFIDENCE = 0.5;
const CACHE_SIZE = 500;

class EngineError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public source?: string,
    public target?: string,
  ) {
    super(message);
  }
}

function fail(e: unknown): Failure {
  if (e instanceof EngineError) {
    return { ok: false, code: e.code, message: e.message, source: e.source, target: e.target };
  }
  return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
}

let detector: Promise<LanguageDetector> | null = null;
const translators = new Map<string, Promise<Translator>>();
const cache = new Map<string, string>();

function getDetector(): Promise<LanguageDetector> {
  detector ??= (async () => {
    if (typeof LanguageDetector === 'undefined') {
      throw new EngineError('no-api', 'This Chrome has no built-in language detection (needs Chrome 138+).');
    }
    const availability = await LanguageDetector.availability();
    if (availability === 'unavailable') {
      throw new EngineError('no-api', 'Language detection is not available on this device.');
    }
    if (availability !== 'available') {
      throw new EngineError('needs-download', 'The language detection model is not downloaded yet.');
    }
    return LanguageDetector.create();
  })().catch((e) => {
    detector = null;
    throw e;
  });
  return detector;
}

function getTranslator(source: string, target: string): Promise<Translator> {
  const key = `${source}>${target}`;
  let t = translators.get(key);
  if (!t) {
    t = (async () => {
      if (typeof Translator === 'undefined') {
        throw new EngineError('no-api', 'This Chrome has no built-in translator (needs Chrome 138+).');
      }
      const pair = { sourceLanguage: source, targetLanguage: target };
      const availability = await Translator.availability(pair);
      const label = `${languageName(source)} → ${languageName(target)}`;
      if (availability === 'unavailable') {
        throw new EngineError('unsupported', `${label} is not supported.`, source, target);
      }
      if (availability !== 'available') {
        throw new EngineError('needs-download', `The ${label} language pack is not downloaded yet.`, source, target);
      }
      return Translator.create(pair);
    })().catch((e) => {
      translators.delete(key);
      throw e;
    });
    translators.set(key, t);
  }
  return t;
}

async function detectTop(text: string): Promise<LanguageDetectionResult> {
  const d = await getDetector();
  const [top] = await d.detect(text.slice(0, 2000));
  return top ?? { detectedLanguage: 'und', confidence: 0 };
}

export async function detect(text: string): Promise<DetectResponse> {
  try {
    const top = await detectTop(text);
    return { ok: true, lang: top.detectedLanguage, confidence: top.confidence };
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

    const key = `${source}>${target}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) {
      remember(key, hit);
      return { ok: true, text: hit, source, target };
    }

    const translator = await getTranslator(source, target);
    // Translate line by line so line breaks survive.
    const parts = text.split(/(\n+)/);
    const out = await Promise.all(
      parts.map(async (p) => {
        if (!p.trim() || /^\n+$/.test(p)) return p;
        const t = await translator.translate(p);
        return shouting(p) ? t.toLocaleUpperCase(target) : t;
      }),
    );
    const result = restoreCase(text, out.join(''));
    remember(key, result);
    return { ok: true, text: result, source, target };
  } catch (e) {
    return fail(e);
  }
}

export async function translateMany(req: TranslateManyRequest): Promise<TranslateManyResponse> {
  const texts: string[] = [];
  for (const text of req.texts) {
    const res = await translate({ type: 'translate', text, source: req.source, target: req.target });
    if (!res.ok) return res;
    texts.push(res.text);
  }
  return { ok: true, texts };
}
