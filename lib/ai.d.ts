// Chrome built-in AI: Translator and LanguageDetector (Chrome 138+).
// https://developer.chrome.com/docs/ai/translator-api

type AIAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface AIDownloadProgressEvent extends Event {
  loaded: number;
}

interface AICreateMonitor extends EventTarget {
  addEventListener(type: 'downloadprogress', listener: (e: AIDownloadProgressEvent) => void): void;
}

interface AICreateOptions {
  monitor?: (m: AICreateMonitor) => void;
  signal?: AbortSignal;
}

interface TranslatorPair {
  sourceLanguage: string;
  targetLanguage: string;
}

interface Translator {
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly inputQuota: number;
  translate(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

declare var Translator: {
  availability(pair: TranslatorPair): Promise<AIAvailability>;
  create(options: TranslatorPair & AICreateOptions): Promise<Translator>;
};

interface LanguageDetectionResult {
  detectedLanguage: string;
  confidence: number;
}

interface LanguageDetector {
  detect(input: string, options?: { signal?: AbortSignal }): Promise<LanguageDetectionResult[]>;
  destroy(): void;
}

declare var LanguageDetector: {
  availability(options?: { expectedInputLanguages?: string[] }): Promise<AIAvailability>;
  create(options?: AICreateOptions & { expectedInputLanguages?: string[] }): Promise<LanguageDetector>;
};
