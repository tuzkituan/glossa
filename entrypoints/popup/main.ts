import { languageName, languageOptions } from '@/lib/languages';
import { send } from '@/lib/messaging';
import { loadSettings, saveSettings } from '@/lib/settings';
import { siteForTab } from '@/lib/sites';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const settings = await loadSettings();
const input = $<HTMLTextAreaElement>('input');
const target = $<HTMLSelectElement>('target');
const output = $('output');

target.innerHTML = languageOptions(settings.target);

async function run() {
  const text = input.value.trim();
  if (!text) return;
  output.hidden = false;
  output.textContent = 'Translating…';
  const res = await send({ type: 'translate', text, target: target.value });
  output.replaceChildren();
  if (!res.ok) {
    output.textContent = res.message;
    if (res.code === 'needs-download' || res.code === 'no-api') {
      const b = document.createElement('button');
      b.textContent = 'Open settings';
      b.style.marginTop = '8px';
      b.onclick = () => send({ type: 'open-options', pair: res.source && res.target ? [res.source, res.target] : undefined });
      output.append(document.createElement('br'), b);
    }
    return;
  }
  const from = document.createElement('span');
  from.className = 'from';
  from.textContent = res.source === 'und' ? '' : `From ${languageName(res.source)}`;
  output.append(from, res.skipped ? `Already in ${languageName(res.target)}.` : res.text);
}

$('go').onclick = run;
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run();
});
$('settings').onclick = () => {
  browser.runtime.openOptionsPage();
  window.close();
};

const selection = $<HTMLInputElement>('selection');
selection.checked = settings.selectionButton;
selection.onchange = () => saveSettings({ selectionButton: selection.checked });

const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
const site = tab?.url ? siteForTab(tab.url) : undefined;
if (site) {
  $('site').hidden = false;
  $('site-name').textContent = site.label;
  const auto = $<HTMLInputElement>('auto');
  auto.checked = settings.messageButtons[site.id];
  auto.onchange = async () => {
    const current = await loadSettings();
    saveSettings({ messageButtons: { ...current.messageButtons, [site.id]: auto.checked } });
  };
}
input.focus();
