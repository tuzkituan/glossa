export type ErrorCode =
  | 'no-api' // Translator API missing in this Chrome
  | 'needs-download' // language pack not installed yet
  | 'unsupported' // pair not supported
  | 'uncertain' // could not tell which language the text is in
  | 'disconnected' // extension was reloaded; page needs a refresh
  | 'error';

export interface TranslateRequest {
  type: 'translate';
  text: string;
  target: string;
  source?: string;
  /** Automatic translation: skip text whose language is uncertain instead of failing. */
  auto?: boolean;
}

/** Several pieces of one message, in a known source language. */
export interface TranslateManyRequest {
  type: 'translate-many';
  texts: string[];
  source: string;
  target: string;
}

export interface DetectRequest {
  type: 'detect';
  text: string;
}

export interface OpenOptionsRequest {
  type: 'open-options';
  pair?: [string, string];
}

export type Request = TranslateRequest | TranslateManyRequest | DetectRequest | OpenOptionsRequest;

export interface Failure {
  ok: false;
  code: ErrorCode;
  message: string;
  source?: string;
  target?: string;
}

export type TranslateResponse =
  | { ok: true; text: string; source: string; target: string; skipped?: 'same-language' | 'uncertain' }
  | Failure;

export type TranslateManyResponse = { ok: true; texts: string[] } | Failure;

export type DetectResponse = { ok: true; lang: string; confidence: number } | Failure;

/** Messages the background forwards to the offscreen document carry `dest: OFFSCREEN`. */
export const OFFSCREEN = 'glossa-offscreen';

export async function send(req: TranslateRequest): Promise<TranslateResponse>;
export async function send(req: TranslateManyRequest): Promise<TranslateManyResponse>;
export async function send(req: DetectRequest): Promise<DetectResponse>;
export async function send(req: OpenOptionsRequest): Promise<void>;
export async function send(req: Request): Promise<unknown> {
  try {
    return await browser.runtime.sendMessage(req);
  } catch (e) {
    return {
      ok: false,
      code: 'disconnected',
      message: 'Glossa was updated. Reload this page to use it here.',
    } satisfies Failure;
  }
}
