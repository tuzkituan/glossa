// Chrome's on-device Translator and LanguageDetector. Window contexts only (offscreen document).
import type { Backend } from '../engine';
import { EngineError } from '../errors';
import { languageName } from '../languages';

let detector: Promise<LanguageDetector> | null = null;
const translators = new Map<string, Promise<Translator>>();

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

export const builtin: Backend = {
  async detect(text) {
    return (await getDetector()).detect(text);
  },
  async translate(texts, source, target) {
    const translator = await getTranslator(source, target);
    return Promise.all(texts.map((t) => translator.translate(t)));
  },
};
