import { google } from '@/lib/backends/google';
import { detect, translate, translateMany, useBackend } from '@/lib/engine';
import { OFFSCREEN, type Request } from '@/lib/messaging';

const OFFSCREEN_URL = '/offscreen.html';
const MENU_ID = 'glossa-translate';

let creating: Promise<void> | null = null;

async function ensureOffscreen() {
  if (await browser.offscreen.hasDocument()) return;
  creating ??= browser.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: ['DOM_PARSER'],
      justification: 'Runs the on-device Translator and LanguageDetector APIs, which only exist in documents.',
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

// Firefox has no on-device translation API and no offscreen documents: translate right here
// with Google Translate. Chrome runs its on-device models in the offscreen document.
const FIREFOX = import.meta.env.FIREFOX;
if (FIREFOX) useBackend(google);

async function forward(msg: Request) {
  if (FIREFOX) {
    if (msg.type === 'translate') return translate(msg);
    if (msg.type === 'translate-many') return translateMany(msg);
    if (msg.type === 'detect') return detect(msg.text);
    return;
  }
  await ensureOffscreen();
  return browser.runtime.sendMessage({ ...msg, dest: OFFSCREEN });
}

async function openOptions(pair?: [string, string]) {
  const url = browser.runtime.getURL('/options.html') + (pair ? `#pair=${pair.join(':')}` : '');
  await browser.tabs.create({ url });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    browser.contextMenus.create({ id: MENU_ID, title: 'Translate "%s"', contexts: ['selection'] });
    if (reason === 'install') openOptions();
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID || tab?.id === undefined) return;
    browser.tabs.sendMessage(tab.id, { type: 'show-selection' }, { frameId: info.frameId }).catch(() => {});
  });

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'translate-selection') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    // No frameId: every frame gets it and the one holding the selection answers.
    if (tab?.id !== undefined) browser.tabs.sendMessage(tab.id, { type: 'show-selection' }).catch(() => {});
  });

  browser.runtime.onMessage.addListener((msg: Request & { dest?: string }, _sender, sendResponse) => {
    if (msg.dest === OFFSCREEN) return;
    if (msg.type === 'translate' || msg.type === 'translate-many' || msg.type === 'detect') {
      forward(msg).then(sendResponse, (e) =>
        sendResponse({ ok: false, code: 'error', message: String(e?.message ?? e) }),
      );
      return true;
    }
    if (msg.type === 'open-options') openOptions(msg.pair);
  });
});
