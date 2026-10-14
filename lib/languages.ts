// Languages Chrome's on-device Translator supports.
export const LANGUAGES = [
  'ar', 'bg', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'hr', 'hu',
  'id', 'it', 'ja', 'kn', 'ko', 'lt', 'mr', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl',
  'sv', 'ta', 'te', 'th', 'tr', 'uk', 'vi', 'zh', 'zh-Hant',
];

const names = new Intl.DisplayNames(['en'], { type: 'language' });

export function languageName(code: string): string {
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Primary subtag, so "zh-Hant" and "zh" compare as the same language for skipping. */
export function baseLang(code: string): string {
  return code.toLowerCase().split('-')[0] ?? code;
}

export function sameLanguage(a: string, b: string): boolean {
  return baseLang(a) === baseLang(b);
}

export function languageOptions(selected: string): string {
  return LANGUAGES.map((code) => ({ code, name: languageName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      ({ code, name }) =>
        `<option value="${code}"${code === selected ? ' selected' : ''}>${name}</option>`,
    )
    .join('');
}

/**
 * The second language mixed into the text ("làm gì có milestones / goals cụ thể"), other
 * than `not`. Only languages the user actually uses count: on short or slangy text the
 * detector's runner-up guesses (Hungarian for Vietnamese chat) are noise.
 */
export function otherLanguage(
  candidates: { lang: string; confidence: number }[],
  not: string,
  mine: string[],
  min = 0.15,
): string | null {
  const hit = candidates.find(
    (c) => c.confidence >= min && !sameLanguage(c.lang, not) && mine.some((l) => sameLanguage(l, c.lang)),
  );
  return hit?.lang ?? null;
}

/**
 * The detected language, trusted only when it's one of mine or the detector is sure.
 * Short or unaccented chat ("ok ae ko dc") gets odd guesses (Slovak, Hungarian); then
 * take the best-ranked language I use, falling back to my own.
 */
export function likelyLanguage(
  candidates: { lang: string; confidence: number }[],
  mine: string[],
  fallback: string,
): string {
  const isMine = (lang: string) => mine.some((l) => sameLanguage(l, lang));
  const top = candidates[0];
  if (top && (isMine(top.lang) || top.confidence >= 0.7)) return top.lang;
  return candidates.find((c) => isMine(c.lang))?.lang ?? fallback;
}
