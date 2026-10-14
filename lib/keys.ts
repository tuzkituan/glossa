const MODIFIERS = ['Control', 'Alt', 'Shift', 'Meta'];

/** "Alt+Enter", "Ctrl+Shift+T", ... Letters come from e.code so Alt+key works on macOS too. */
export function keyCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  if (MODIFIERS.includes(e.key)) return parts.join('+');
  let key = e.key;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  return [...parts, key].join('+');
}

/** A combo is usable when it has a modifier and a non-modifier key. */
export function isCompleteCombo(combo: string): boolean {
  const parts = combo.split('+');
  return parts.length > 1 && !['Ctrl', 'Alt', 'Shift', 'Meta'].includes(parts.at(-1)!);
}
