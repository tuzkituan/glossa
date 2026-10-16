const BLOCK = /^(block|list-item|flex|grid|table|flow-root)$/;

/** Children of a horizontal flex/grid container sit side by side on screen. */
function laysOutInline(parent: Element): boolean {
  const style = getComputedStyle(parent);
  if (/flex$/.test(style.display)) return !style.flexDirection.startsWith('column');
  return /grid$/.test(style.display) ? style.gridAutoFlow.startsWith('column') : false;
}

/**
 * Screen-reader-only text ("Quote", "Press L to link back…") is clipped to nothing
 * rather than display:none. Uses computed (not layout) values, so it still works
 * when the message itself is hidden behind its translation.
 */
function screenReaderOnly(style: CSSStyleDeclaration): boolean {
  if (style.position !== 'absolute' && style.position !== 'fixed') return false;
  return (
    style.clip !== 'auto' ||
    (style.clipPath !== 'none' && style.clipPath !== '') ||
    (style.width === '1px' && style.height === '1px') ||
    style.opacity === '0'
  );
}

/**
 * The text of a message as it reads on screen. Unlike innerText, inline chips
 * (mentions, links styled as pills) that a flex row blockifies stay on the line.
 */
export function readableText(root: HTMLElement): string {
  let out = '';
  const breakLine = () => {
    if (out && !out.endsWith('\n')) out += '\n';
  };
  const walk = (node: Node, parentInline: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? '';
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') {
      out += '\n';
      return;
    }
    if (node.tagName === 'IMG') {
      out += (node as HTMLImageElement).alt; // emoji
      return;
    }
    if (node.tagName === 'PARLEY-LINE') return;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || screenReaderOnly(style)) return;
    const block = !parentInline && BLOCK.test(style.display);
    if (block) breakLine();
    const inline = laysOutInline(node);
    for (const child of node.childNodes) walk(child, inline);
    if (block) breakLine();
  };
  for (const child of root.childNodes) walk(child, laysOutInline(root));
  return out
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
