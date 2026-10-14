import { googleChat } from './googleChat';
import { linkedin } from './linkedin';
import { messenger } from './messenger';
import type { SiteAdapter } from './types';

export const SITES: SiteAdapter[] = [googleChat, messenger, linkedin];

export function siteFor(url: string | URL): SiteAdapter | undefined {
  try {
    const u = typeof url === 'string' ? new URL(url) : url;
    return SITES.find((s) => s.matches(u));
  } catch {
    return undefined;
  }
}

export type { SiteAdapter };

/** Site whose Translate-button switch the toolbar popup shows for a tab. Gmail embeds Google Chat. */
export function siteForTab(url: string): SiteAdapter | undefined {
  const site = siteFor(url);
  if (site) return site;
  try {
    return new URL(url).hostname === 'mail.google.com' ? googleChat : undefined;
  } catch {
    return undefined;
  }
}
