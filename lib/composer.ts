// Adds draft buttons (Translate, Fix) to the site's message boxes; same actions as the shortcuts.
import type { SiteAdapter } from './sites';

export interface DraftAction {
  id: string;
  icon: string;
  /** Tooltip, read when the button is created so it shows the current shortcut. */
  label: () => string;
  run: (editor: HTMLElement) => void;
}

export class ComposerButtons {
  private enabled = false;
  private timer = 0;
  private buttons = new Set<HTMLElement>();
  private mo = new MutationObserver(() => this.schedule());

  constructor(
    private site: SiteAdapter,
    private actions: DraftAction[],
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
      for (const action of this.actions) {
        if (slot.parentElement?.querySelector(`:scope > [data-glossa-draft="${action.id}"]`)) continue;
        const { root, button } = composer.button(action.icon);
        root.setAttribute('data-glossa-draft', action.id);
        const label = action.label();
        button.title = label;
        button.setAttribute('aria-label', label);
        // Keep focus and the caret in the text box.
        button.addEventListener('mousedown', (e) => e.preventDefault());
        button.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          action.run(editor);
        });
        slot.before(root);
        this.buttons.add(root);
      }
    }
  }
}
