import { keyCombo } from '@/lib/keys';
import { ComposerButtons } from '@/lib/composer';
import { MessageButtons } from '@/lib/messages';
import { send, type Failure } from '@/lib/messaging';
import { focusedEditable, translateDraft } from '@/lib/reply';
import { loadSettings, watchSettings } from '@/lib/settings';
import { siteFor } from '@/lib/sites';
import { hidePopups, isOwnEvent, showButton, showCard, toast } from '@/lib/ui/overlay';

const MAX_SELECTION = 5000;

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',

  async main() {
    let settings = await loadSettings();
    const site = siteFor(location.href);

    const openSettings = (pair?: [string, string]) => send({ type: 'open-options', pair });

    // Background failures toast once per problem per page; a click always answers.
    const reported = new Set<string>();
    const onMessageFailure = (f: Failure, clicked = false) => {
      const key = `${f.code}:${f.source}>${f.target}`;
      if (reported.has(key) && !clicked) return;
      reported.add(key);
      const pair: [string, string] | undefined = f.source && f.target ? [f.source, f.target] : undefined;
      toast(`Glossa: ${f.message}`, undefined, { label: 'Set up', run: () => openSettings(pair) }, 8000);
    };

    const buttons = site ? new MessageButtons(site, () => settings, onMessageFailure) : null;
    if (site) buttons!.setEnabled(settings.messageButtons[site.id]);
    const composers = site
      ? new ComposerButtons(
          site,
          (editor) => translateDraft(editor, settings, site, openSettings),
          () => settings.replyKey,
        )
      : null;
    if (site) composers!.setEnabled(settings.messageButtons[site.id]);

    // Reloading the extension orphans this script: it stops hearing settings changes,
    // so a toggle-off would never reach it. Shut down and remove what it rendered.
    const watchdog = window.setInterval(() => {
      if (browser.runtime?.id) return;
      window.clearInterval(watchdog);
      buttons?.setEnabled(false);
      composers?.setEnabled(false);
      hidePopups();
    }, 2000);

    watchSettings((next) => {
      const prev = settings;
      settings = next;
      if (!site || !buttons) return;
      buttons.setEnabled(next.messageButtons[site.id]);
      composers?.setEnabled(next.messageButtons[site.id]);
      if (prev.target !== next.target) buttons.reset();
    });

    function selectedText(): { text: string; rect: DOMRect } | null {
      const active = document.activeElement;
      let text = '';
      let rect: DOMRect | null = null;
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
        const { selectionStart: a, selectionEnd: b } = active;
        if (a !== null && b !== null && b > a) {
          text = active.value.slice(a, b);
          rect = active.getBoundingClientRect();
        }
      }
      if (!text) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
        text = sel.toString();
        rect = sel.getRangeAt(0).getBoundingClientRect();
      }
      text = text.trim();
      if (!text || text.length > MAX_SELECTION || !rect) return null;
      return { text, rect };
    }

    async function openCard(text: string, rect: DOMRect, target = settings.target) {
      const card = showCard(rect, target, {
        onTargetChange: (t) => openCard(text, rect, t),
        onOpenSettings: openSettings,
      });
      card.update(await send({ type: 'translate', text, target }));
    }

    document.addEventListener(
      'mouseup',
      (e) => {
        if (isOwnEvent(e) || !settings.selectionButton) return;
        // Let the selection settle (a click inside a selection collapses it after mouseup).
        setTimeout(() => {
          const sel = selectedText();
          if (sel) showButton(sel.rect, () => openCard(sel.text, sel.rect));
        }, 10);
      },
      true,
    );
    document.addEventListener('mousedown', (e) => !isOwnEvent(e) && hidePopups(), true);
    document.addEventListener('scroll', (e) => !isOwnEvent(e) && hidePopups(), true);

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') hidePopups();
        if (keyCombo(e) !== settings.replyKey) return;
        const el = focusedEditable();
        if (!el) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        translateDraft(el, settings, site, openSettings);
      },
      true,
    );

    // Context menu and the Alt+T command.
    browser.runtime.onMessage.addListener((msg: { type?: string }) => {
      if (msg.type !== 'show-selection') return;
      const sel = selectedText();
      if (sel) openCard(sel.text, sel.rect);
    });
  },
});
