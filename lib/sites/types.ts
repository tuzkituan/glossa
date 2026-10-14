import type { SiteId } from '../settings';

export interface SiteAdapter {
  id: SiteId;
  label: string;
  matches(url: URL): boolean;
  /** Elements holding the text of each chat message currently in the DOM. */
  messages(root: ParentNode): HTMLElement[];
  /** True for messages I sent. */
  isOutgoing(el: HTMLElement): boolean;
  /**
   * The last reaction chip of a message, to put the Translate button after.
   * Sites without this use a generic guess. `others` are the page's other messages.
   */
  reactionAnchor?(el: HTMLElement, others: HTMLElement[]): HTMLElement | null;
  /** The message's hover toolbar, where a Translate icon button goes. */
  toolbar?: {
    /** Element to insert the button before, or null while the toolbar isn't rendered. */
    slot(el: HTMLElement): Element | null;
    /** A button styled like the site's own toolbar buttons. */
    button(): ToolbarButton;
  };
  /** Message boxes, where a Translate-draft button goes next to the site's own icons. */
  composer?: {
    /** Each composer on the page: its text box and the element to insert the button before. */
    find(): { editor: HTMLElement; slot: Element }[];
    button(): ToolbarButton;
  };
}

export interface ToolbarButton {
  root: HTMLElement;
  button: HTMLButtonElement;
}

/** Material "translate" icon. */
export const TRANSLATE_ICON =
  'M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z';

/** Climb from a message to its own container, stopping before one that holds other messages. */
export function* ownAncestors(el: HTMLElement, others: HTMLElement[], max = 10): Generator<HTMLElement> {
  let anc = el.parentElement;
  for (let i = 0; anc && i < max; i++, anc = anc.parentElement) {
    const a = anc;
    if (others.some((o) => o !== el && a.contains(o))) return;
    yield a;
  }
}

function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return document.documentElement;
}

/**
 * Bubble layouts put my messages on the right. Works across sites without
 * relying on class names; left-aligned layouts (wide messages) read as incoming.
 */
export function isRightAligned(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  if (!box.width) return false;
  const pane = scrollParent(el).getBoundingClientRect();
  const leftGap = box.left - pane.left;
  const rightGap = pane.right - box.right;
  return leftGap > 60 && rightGap < leftGap * 0.4;
}
