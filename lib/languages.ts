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
