import type { ErrorCode } from './messaging';

export class EngineError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public source?: string,
    public target?: string,
  ) {
    super(message);
  }
}
