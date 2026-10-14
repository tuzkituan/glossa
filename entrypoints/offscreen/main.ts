import { builtin } from '@/lib/backends/builtin';
import { detect, translate, translateMany, useBackend } from '@/lib/engine';
import { OFFSCREEN, type Request } from '@/lib/messaging';

useBackend(builtin);

browser.runtime.onMessage.addListener((msg: Request & { dest?: string }, _sender, sendResponse) => {
  // Content scripts' messages reach this page too; only answer what the background forwards.
  if (msg.dest !== OFFSCREEN) return;
  if (msg.type === 'translate') translate(msg).then(sendResponse);
  else if (msg.type === 'translate-many') translateMany(msg).then(sendResponse);
  else if (msg.type === 'detect') detect(msg.text).then(sendResponse);
  else return;
  return true;
});
