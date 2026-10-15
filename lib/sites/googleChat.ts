import { isRightAligned, ownAncestors, TRANSLATE_ICON, type SiteAdapter } from './types';

// Message bodies carry jsname="bgckF" in both chat.google.com and the Chat frames inside Gmail.
const BODY = 'div[jsname="bgckF"]';
// Hover toolbar: a sibling of the body; its action buttons end with the "More actions" menu.
const TOOLBAR = '[jsname="zgWRWd"]';
const MORE_ACTIONS = '[data-more-actions-menu-button-id]';
// Chat's own icon-button classes, so ours looks and sizes like its neighbours.
const ACTION_WRAP = 'oRJ94c';
const ACTION_BUTTON = 'pYTkkf-Bz112c-LgbsSe pYTkkf-Bz112c-LgbsSe-OWXEXe-SfQLQb-suEOdc PFn4wd dmFw0d RrN36 FmuFtb';
// Composer: the text box and its icon row share a container; ours go before Formatting (A).
const COMPOSER = '[jsname="ZQsur"]';
const EDITOR = '[role="textbox"][contenteditable="true"]';
const FORMATTING = 'button[jsname="VrqbYe"]';
const ICON_ROW = '[jsname="bXurze"] > div';
const COMPOSER_BUTTON = 'pYTkkf-Bz112c-LgbsSe pYTkkf-Bz112c-LgbsSe-OWXEXe-SfQLQb-suEOdc KP38Df wAZd3e FmuFtb';

function iconButton(wrapClass: string, buttonClass: string, size: number, icon: string) {
  const root = document.createElement('div');
  root.className = wrapClass;
  root.innerHTML = `<button class="${buttonClass}"><span class="pYTkkf-Bz112c-kBDsod-Rtc0Jf" aria-hidden="true"><span class="notranslate VfPpkd-kBDsod" aria-hidden="true"><svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"><path d="${icon}"></path></svg></span></span></button>`;
  return { root, button: root.querySelector('button')! };
}

// Reactions row: role=list of role=listitem chips, each with data-count.
const REACTION = '[role="list"] > [role="listitem"][data-count]';

export const googleChat: SiteAdapter = {
  id: 'googleChat',
  label: 'Google Chat',
  matches: (url) =>
    url.hostname === 'chat.google.com' ||
    (url.hostname === 'mail.google.com' && url.pathname.startsWith('/chat')),
  messages: (root) => [...root.querySelectorAll<HTMLElement>(BODY)],
  isOutgoing: (el) => isRightAligned(el),
  reactionAnchor(el, others) {
    for (const anc of ownAncestors(el, others)) {
      const items = anc.querySelectorAll<HTMLElement>(REACTION);
      if (items.length) return items[items.length - 1]!;
    }
    return null;
  },
  toolbar: {
    slot(el) {
      const bar = el.parentElement?.querySelector(`:scope > ${TOOLBAR}`);
      return bar?.querySelector(MORE_ACTIONS) ?? null;
    },
    button: () => iconButton(ACTION_WRAP, ACTION_BUTTON, 20, TRANSLATE_ICON),
  },
  composer: {
    find() {
      const found: { editor: HTMLElement; slot: Element }[] = [];
      for (const root of document.querySelectorAll<HTMLElement>(COMPOSER)) {
        const editor = root.querySelector<HTMLElement>(EDITOR);
        const slot =
          root.querySelector(FORMATTING)?.closest('span[jsshadow]') ??
          root.querySelector(ICON_ROW)?.firstElementChild;
        if (editor && slot) found.push({ editor, slot });
      }
      return found;
    },
    button: (icon) => iconButton('', COMPOSER_BUTTON, 24, icon),
  },
};
