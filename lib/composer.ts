// Adds a Translate-draft button to the site's message boxes; same action as the reply shortcut.
import type { SiteAdapter } from './sites';

export class ComposerButtons {
  private enabled = false;
  private timer = 0;
  private buttons = new Set<HTMLElement>();
  private mo = new MutationObserver(() => this.schedule());

  constructor(
    private site: SiteAdapter,
    private onTranslate: (editor: HTMLElement) => void,
    private hint: () => string,
  ) {}

  setEnabled(on: boolean) {
    if (!this.site.composer || on === this.enabled) return;
    this.enabled = on;
    if (on) {
      this.mo.observe(document.body, { childList: true, subtree: true });
      this.schedule();
    } else {
      this.mo.disconnect();
      for (const b of this.buttons) b.remove();
      this.buttons.clear();
    }
  }

  private schedule() {
    if (this.timer) return;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.attach();
    }, 300);
  }

  private attach() {
    const composer = this.site.composer;
    if (!composer || !this.enabled) return;
    for (const b of this.buttons) if (!b.isConnected) this.buttons.delete(b);
    for (const { editor, slot } of composer.find()) {
      if (slot.parentElement?.querySelector(':scope > [data-glossa-draft]')) continue;
      const { root, button } = composer.button();
      root.setAttribute('data-glossa-draft', '');
      const label = `Translate my draft (${this.hint()})`;
      button.title = label;
      button.setAttribute('aria-label', label);
      // Keep focus and the caret in the text box.
      button.addEventListener('mousedown', (e) => e.preventDefault());
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onTranslate(editor);
      });
      slot.before(root);
      this.buttons.add(root);
    }
  }
}
