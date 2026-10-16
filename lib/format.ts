// Translate a message without losing its formatting: copy the element and swap
// only the words inside it, leaving chips (mentions, emoji, links) and layout alone.

const BLOCK = /^(block|list-item|flex|grid|table|flow-root)$/;

export interface Segment {
  /** Text nodes that read as one run of words; the translation goes into the first. */
  nodes: Text[];
  text: string;
}

function horizontalFlex(style: CSSStyleDeclaration): boolean {
  return /flex$/.test(style.display) && !style.flexDirection.startsWith('column');
}

function hidden(style: CSSStyleDeclaration): boolean {
  if (style.display === 'none' || style.visibility === 'hidden') return true;
  // Screen-reader-only text ("Quote", "Press L to link back…") is clipped, not removed.
  if (style.position !== 'absolute' && style.position !== 'fixed') return false;
  return style.clip !== 'auto' || (style.clipPath !== 'none' && style.clipPath !== '') || style.opacity === '0';
}

/** Mention pills, emoji, buttons: kept exactly as they are. */
function atomic(el: HTMLElement, style: CSSStyleDeclaration): boolean {
  if (/^(IMG|BUTTON|SVG|VIDEO|CANVAS|INPUT)$/i.test(el.tagName)) return true;
  if (el.getAttribute('role') === 'button' || el.getAttribute('contenteditable') === 'false') return true;
  if (/^inline-(flex|block|grid)$/.test(style.display)) return true;
  if (el.tagName === 'A' && /^\s*(https?:\/\/|www\.)/.test(el.textContent ?? '')) return true;
  const pill = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(style.borderRadius) > 0;
  return pill && (el.textContent ?? '').length < 60;
}

export function segments(root: HTMLElement): Segment[] {
  const out: Segment[] = [];
  let run: Text[] = [];
  const flush = () => {
    const text = run.map((n) => n.data).join('');
    if (/\p{L}/u.test(text)) out.push({ nodes: run, text });
    run = [];
  };
  const walk = (node: Node, inRow: boolean) => {
    if (node instanceof Text) {
      run.push(node);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') return flush();
    if (node.tagName.startsWith('PARLEY-')) return;
    const style = getComputedStyle(node);
    if (hidden(style)) return;
    if (atomic(node, style)) return flush();
    const block = !inRow && BLOCK.test(style.display);
    if (block) flush();
    const row = horizontalFlex(style);
    for (const child of node.childNodes) walk(child, row);
    if (block) flush();
  };
  const rootRow = horizontalFlex(getComputedStyle(root));
  for (const child of root.childNodes) walk(child, rootRow);
  flush();
  return out;
}

function pathOf(node: Node, root: Node): number[] {
  const path: number[] = [];
  for (let n = node; n !== root; n = n.parentNode!) {
    path.unshift([...n.parentNode!.childNodes].indexOf(n as ChildNode));
  }
  return path;
}

function resolve(root: Node, path: number[]): Node {
  return path.reduce<Node>((n, i) => n.childNodes[i]!, root);
}

/** A copy of root with each segment's words replaced by its translation. */
export function translatedCopy(root: HTMLElement, segs: Segment[], translations: string[]): HTMLElement {
  const copy = root.cloneNode(true) as HTMLElement;
  segs.forEach((seg, i) => {
    const nodes = seg.nodes.map((n) => resolve(copy, pathOf(n, root)) as Text);
    // Keep the run's surrounding spaces so it still sits right next to chips.
    const lead = /^\s*/.exec(seg.text)![0];
    const trail = /\s*$/.exec(seg.text)![0];
    nodes.forEach((n, j) => (n.data = j === 0 ? lead + translations[i]!.trim() + trail : ''));
  });
  return copy;
}
