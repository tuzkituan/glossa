import { isCompleteCombo, keyCombo } from '@/lib/keys';
import { languageName, languageOptions, sameLanguage } from '@/lib/languages';
import { loadSettings, saveSettings, type Settings } from '@/lib/settings';
import { SITES } from '@/lib/sites';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let settings = await loadSettings();
/** Pairs added by hand or requested by a page (#pair=ja:vi), kept for this visit. */
const extraPairs: [string, string][] = [];
let highlight: string | null = null;

const hashPair = /pair=([\w-]+):([\w-]+)/.exec(location.hash);
if (hashPair) {
  const [, from = '', to = ''] = hashPair;
  extraPairs.push([from, to]);
  highlight = `${from}>${to}`;
}

const hasApi = typeof Translator !== 'undefined' && typeof LanguageDetector !== 'undefined';
$('no-api').hidden = hasApi;

async function update(patch: Partial<Settings>) {
  settings = await saveSettings(patch);
  render();
}

// Languages

const target = $<HTMLSelectElement>('target');
const replyLang = $<HTMLSelectElement>('replyLang');
const addLang = $<HTMLSelectElement>('addLang');

target.onchange = () => update({ target: target.value });
replyLang.onchange = () => update({ replyLang: replyLang.value });
for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="replyMode"]')) {
  radio.onchange = () => update({ replyMode: radio.value as Settings['replyMode'] });
}
addLang.onchange = () => {
  const code = addLang.value;
  if (code && !settings.languages.includes(code)) update({ languages: [...settings.languages, code] });
  else render();
};

function renderLanguages() {
  target.innerHTML = languageOptions(settings.target);
  replyLang.innerHTML = languageOptions(settings.replyLang);
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="replyMode"]')) {
    radio.checked = radio.value === settings.replyMode;
  }
  $('replyLangLabel').textContent =
    settings.replyMode === 'match' ? 'If that can’t be detected, use' : 'Reply language';

  const chips = $('langs');
  chips.replaceChildren(
    ...settings.languages.map((code) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const remove = document.createElement('button');
      remove.textContent = '×';
      remove.title = `Remove ${languageName(code)}`;
      remove.onclick = () => update({ languages: settings.languages.filter((l) => l !== code) });
      chip.append(languageName(code), remove);
      return chip;
    }),
  );
  addLang.innerHTML = `<option value="">Add a language…</option>${languageOptions('')}`;
}

// Language packs

function pairs(): [string, string][] {
  const out = new Map<string, [string, string]>();
  const add = (a: string, b: string) => {
    if (!sameLanguage(a, b)) out.set(`${a}>${b}`, [a, b]);
  };
  for (const lang of new Set([...settings.languages, settings.replyLang])) {
    add(lang, settings.target);
    add(settings.target, lang);
  }
  for (const [a, b] of extraPairs) add(a, b);
  return [...out.values()];
}

const STATUS: Record<AIAvailability, [string, string]> = {
  available: ['Ready', 'ok'],
  downloadable: ['Not downloaded', 'warn'],
  downloading: ['Downloading…', 'warn'],
  unavailable: ['Not supported', 'bad'],
};

function packRow(label: string, key: string, check: () => Promise<AIAvailability>, download: (m: (e: AIDownloadProgressEvent) => void) => Promise<unknown>) {
  const tr = document.createElement('tr');
  if (key === highlight) tr.className = 'highlight';
  const name = document.createElement('td');
  const status = document.createElement('td');
  const action = document.createElement('td');
  name.textContent = label;
  status.className = 'status muted';
  status.textContent = 'Checking…';
  action.className = 'action';
  tr.append(name, status, action);

  const refresh = async () => {
    action.replaceChildren();
    let a: AIAvailability;
    try {
      a = await check();
    } catch (e) {
      status.textContent = String((e as Error).message ?? e);
      status.className = 'status bad';
      return;
    }
    const [text, cls] = STATUS[a];
    status.textContent = text;
    status.className = `status ${cls}`;
    if (a === 'downloadable' || a === 'downloading') {
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = 'Download';
      b.onclick = () => {
        // create() needs the click's user activation, so call it before anything else awaits.
        const progress = document.createElement('progress');
        progress.max = 1;
        progress.value = 0;
        action.replaceChildren(progress);
        download((e) => (progress.value = e.loaded)).then(refresh, async (err) => {
          // The first download also fetches Chrome's translation engine, and creating a
          // translator before that lands fails even though the pack itself installs.
          // Show the real state afterwards, and keep retrying possible.
          await refresh();
          if (status.textContent === STATUS.available[0]) return;
          status.textContent = `Failed: ${err?.message ?? err}`;
          status.className = 'status bad';
          if (!action.querySelector('button')) {
            const retry = document.createElement('button');
            retry.textContent = 'Retry';
            retry.onclick = () => b.click();
            action.replaceChildren(retry);
          } else {
            action.querySelector('button')!.textContent = 'Retry';
          }
        });
      };
      action.append(b);
    }
  };
  refresh();
  return tr;
}

function renderPacks() {
  const body = $('packs').querySelector('tbody')!;
  if (!hasApi) {
    body.replaceChildren();
    return;
  }
  const rows = [
    packRow(
      'Language detection',
      'detector',
      () => LanguageDetector.availability(),
      (onProgress) =>
        LanguageDetector.create({ monitor: (m) => m.addEventListener('downloadprogress', onProgress) }).then((d) =>
          d.destroy(),
        ),
    ),
    ...pairs().map(([a, b]) =>
      packRow(
        `${languageName(a)} → ${languageName(b)}`,
        `${a}>${b}`,
        () => Translator.availability({ sourceLanguage: a, targetLanguage: b }),
        (onProgress) =>
          Translator.create({
            sourceLanguage: a,
            targetLanguage: b,
            monitor: (m) => m.addEventListener('downloadprogress', onProgress),
          }).then((t) => t.destroy()),
      ),
    ),
  ];
  body.replaceChildren(...rows);
}

const pairFrom = $<HTMLSelectElement>('pairFrom');
const pairTo = $<HTMLSelectElement>('pairTo');
$('addPair').onclick = () => {
  if (sameLanguage(pairFrom.value, pairTo.value)) return;
  extraPairs.push([pairFrom.value, pairTo.value]);
  renderPacks();
};

// Chats

function renderSites() {
  $('sites').replaceChildren(
    ...SITES.map((site) => {
      const label = document.createElement('label');
      label.className = 'row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'switch';
      input.checked = settings.messageButtons[site.id];
      input.onchange = () => update({ messageButtons: { ...settings.messageButtons, [site.id]: input.checked } });
      label.append(input, `Translate buttons on ${site.label} messages`);
      return label;
    }),
  );
}

// Shortcuts

const replyKey = $<HTMLInputElement>('replyKey');
replyKey.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') return;
  e.preventDefault();
  const combo = keyCombo(e);
  replyKey.value = combo;
  if (isCompleteCombo(combo)) update({ replyKey: combo });
});
replyKey.addEventListener('blur', () => (replyKey.value = settings.replyKey));

const selectionButton = $<HTMLInputElement>('selectionButton');
selectionButton.onchange = () => update({ selectionButton: selectionButton.checked });

$('shortcuts').onclick = (e) => {
  e.preventDefault();
  browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
};
browser.commands.getAll().then((cmds) => {
  const cmd = cmds.find((c) => c.name === 'translate-selection');
  $('selKey').textContent = cmd?.shortcut || 'not set';
});

function render() {
  renderLanguages();
  renderPacks();
  renderSites();
  replyKey.value = settings.replyKey;
  selectionButton.checked = settings.selectionButton;
}

pairFrom.innerHTML = languageOptions(settings.target === 'vi' ? 'en' : 'vi');
pairTo.innerHTML = languageOptions(settings.target);
render();
