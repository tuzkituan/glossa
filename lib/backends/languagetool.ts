// English proofreading on Firefox through LanguageTool's free public API. Text leaves the device.
import { EngineError } from '../errors';

const ENDPOINT = 'https://api.languagetool.org/v2/check';
/** Pieces are checked in one request, kept apart by a blank line. */
const SEP = '\n\n';
/** Style hints and US-vs-UK spelling are opinions, not mistakes. */
const SKIP_ISSUES = new Set(['style', 'locale-violation']);

interface Match {
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: { issueType: string };
}

/** Spans of code-like words ("Tour.GuideButton", "PRD", "snake_case", URLs, @mentions). */
function codeSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const word = m[0].replace(/^[("'`[{<]+|[)"'`\]}>,;:!?.]+$/g, '');
    if (/.\p{Lu}/u.test(word) || /\w[._/\\:#@-]\w/.test(word) || /^[@#]/.test(word)) {
      spans.push([m.index, m.index + m[0].length]);
    }
  }
  return spans;
}

/** Leave code alone, and capitalized words mid-sentence: they are names, not misspellings. */
function keep(match: Match, at: number, text: string, code: [number, number][]): boolean {
  if (code.some(([a, b]) => at < b && at + match.length > a)) return true;
  if (match.rule.issueType !== 'misspelling') return false;
  return /^\p{Lu}/u.test(text.slice(at)) && !/(^|[.!?]\s+)$/.test(text.slice(0, at));
}

export async function languageTool(texts: string[]): Promise<string[]> {
  const body = new URLSearchParams({ text: texts.join(SEP), language: 'en-US' });
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: 'POST', body });
  } catch {
    throw new EngineError('error', "Couldn't reach LanguageTool. Check your connection.");
  }
  if (!res.ok) {
    throw new EngineError('error', `LanguageTool refused the request (${res.status}). Try again in a minute.`);
  }
  const { matches } = (await res.json()) as { matches?: Match[] };
  if (!Array.isArray(matches)) throw new EngineError('error', 'Unexpected answer from LanguageTool.');

  let from = 0;
  return texts.map((text) => {
    const start = from;
    from += text.length + SEP.length;
    const mine = matches
      .filter((m) => m.offset >= start && m.offset + m.length <= start + text.length)
      .filter((m) => m.replacements.length && !SKIP_ISSUES.has(m.rule.issueType))
      .sort((a, b) => b.offset - a.offset);
    // Apply from the end so earlier offsets stay valid; skip overlapping suggestions.
    const code = codeSpans(text);
    let out = text;
    let limit = Infinity;
    for (const m of mine) {
      const at = m.offset - start;
      if (at + m.length > limit) continue;
      if (keep(m, at, text, code)) continue;
      out = out.slice(0, at) + m.replacements[0]!.value + out.slice(at + m.length);
      limit = at;
    }
    return out;
  });
}
