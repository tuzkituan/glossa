export type SiteId = 'googleChat' | 'messenger' | 'linkedin';

export interface Settings {
  /** Language that incoming messages and selections are translated into. */
  target: string;
  /** "match": reply in the language the other person writes in; "fixed": always replyLang. */
  replyMode: 'match' | 'fixed';
  /** Reply language in fixed mode, and the fallback in match mode. */
  replyLang: string;
  /** Other languages you read or write; used to list language packs in settings. */
  languages: string[];
  /** Per chat site: show a Translate button under foreign-language messages. */
  messageButtons: Record<SiteId, boolean>;
  selectionButton: boolean;
  replyKey: string;
}

export function defaults(): Settings {
  return {
    target: 'vi',
    replyMode: 'match',
    replyLang: 'en',
    languages: ['en'],
    messageButtons: { googleChat: true, messenger: true, linkedin: true },
    selectionButton: true,
    replyKey: 'Alt+Enter',
  };
}

export async function loadSettings(): Promise<Settings> {
  const base = defaults();
  const stored = (await browser.storage.sync.get('settings')).settings as Partial<Settings> | undefined;
  return {
    ...base,
    ...stored,
    messageButtons: { ...base.messageButtons, ...stored?.messageButtons },
  };
}

// Only what the user changed is stored, so new defaults still reach everything else.
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const stored = (await browser.storage.sync.get('settings')).settings as Partial<Settings> | undefined;
  await browser.storage.sync.set({ settings: { ...stored, ...patch } });
  return loadSettings();
}

export function watchSettings(cb: (s: Settings) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) loadSettings().then(cb);
  });
}
