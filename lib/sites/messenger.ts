import { isRightAligned, type SiteAdapter } from './types';

// Messenger (messenger.com, facebook.com/messages and the chat heads on facebook.com):
// each message is a grid row; the text sits in the innermost dir="auto" element.
const ROW_TEXT = '[role="row"] div[dir="auto"]';

export const messenger: SiteAdapter = {
  id: 'messenger',
  label: 'Messenger',
  matches: (url) => /(^|\.)(facebook|messenger)\.com$/.test(url.hostname),
  messages: (root) =>
    [...root.querySelectorAll<HTMLElement>(ROW_TEXT)].filter(
      (el) =>
        !el.querySelector('div[dir="auto"]') &&
        !el.closest('[role="navigation"], a, [role="link"], h1, h2, h3, h4, h5, h6'),
    ),
  isOutgoing: (el) => isRightAligned(el),
};
