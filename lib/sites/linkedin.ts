import type { SiteAdapter } from './types';

const BODY = '.msg-s-event-listitem__body';
const ITEM = '.msg-s-event-listitem';
// LinkedIn marks the other person's messages, not mine.
const OTHER = 'msg-s-event-listitem--other';

export const linkedin: SiteAdapter = {
  id: 'linkedin',
  label: 'LinkedIn',
  matches: (url) => /(^|\.)linkedin\.com$/.test(url.hostname),
  messages: (root) => [...root.querySelectorAll<HTMLElement>(BODY)],
  isOutgoing: (el) => {
    const item = el.closest(ITEM);
    // If LinkedIn ever drops the marker, translate everything rather than nothing.
    if (!item || !document.querySelector(`.${OTHER}`)) return false;
    return !item.classList.contains(OTHER);
  },
};
