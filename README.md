# Glossa

Browser extension that translates chat messages and selected text, and fixes the English in your drafts. On Chrome everything runs on your device with Chrome's built-in AI models: no API keys, no account, and no text leaves the browser.

- **Selection**: select text on any page and click the button that appears, or press Alt+T, or right-click → Translate.
- **Chat messages**: on Google Chat, Messenger/Facebook and LinkedIn, every message gets a Translate button (in the hover toolbar on Google Chat). Clicking it swaps the message for its translation in place, keeping mentions and formatting; click again for the original. A message already in your language is translated into your reply language.
- **Your reply**: type in your language in any text box and press Alt+Enter. The draft is replaced with the translation (Ctrl+Z restores it). On the chat sites it can reply in the language the other person writes in.
- **Fix English**: in any text box press Alt+G, or click the spellcheck button next to Translate on Google Chat. Spelling, grammar and punctuation in your English draft are corrected in place, keeping mentions and code names (Ctrl+Z restores it). Chrome uses Gemini Nano on the device; download it under **Language packs**. Firefox sends the draft to LanguageTool.
- **Toolbar popup**: translate typed text and turn the message buttons on or off for the current site.

Every language, site an## Install

Glossa isn't in the Chrome Web Store or Firefox Add-ons yet, so you install it from a release download.

### Chrome (recommended)

Needs desktop Chrome 138 or newer (Windows, macOS, Linux or ChromeOS). Check at `chrome://settings/help`.

1. Open the [latest release](https://github.com/tuzkituan/glossa/releases/latest) and download `glossa-<version>-chrome.zip`.
2. Unzip it into a folder you'll keep, for example `Documents/glossa`. Chrome loads the extension from this folder every time it starts, so don't delete or move it.
3. Open `chrome://extensions` in the address bar.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and pick the unzipped folder (the one that contains `manifest.json`).
6. Pin Glossa: click the puzzle icon in the toolbar, then the pin next to Glossa.

The settings page opens by itself. Do this once:

1. Pick the language you want messages translated **into**, and the languages you write in.
2. Under **Language packs**, click **Download** on each row you need: language detection, each language pair, and **English proofreading** if you want Fix English. Each model downloads once and stays on your computer. Chrome only allows these downloads from a click on this page.

Gemini Nano, the model behind Fix English, needs about 22 GB of free disk and either a GPU with more than 4 GB of memory or 16 GB of RAM. Translation works without it.

**Updating:** download the new zip, unzip it over the same folder, then click the reload arrow on Glossa's card in `chrome://extensions`. Your settings are kept.

### Firefox

Needs Firefox 115 or newer. Firefox has no on-device translation, so this build sends the text you translate to Google Translate and the drafts you fix to LanguageTool, only when you ask.

Firefox only installs extensions signed by Mozilla for good, and this one isn't signed yet, so it has to be loaded again after each restart:

1. Download `glossa-<version>-firefox.zip` from the [latest release](https://github.com/tuzkituan/glossa/releases/latest). Don't unzip it.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick the zip.

## Use

| To | Do |
| --- | --- |
| Translate text on any page | Select it and click the button that appears, press **Alt+T**, or right-click → Translate |
| Translate a chat message | Click its Translate button (Google Chat, Messenger, LinkedIn) |
| Translate your reply before sending | Press **Alt+Enter** in the text box |
| Fix your English | Press **Alt+G** in the text box |
| Undo either | **Ctrl+Z**, or Undo on the notice |

Shortcuts can be changed in settings (click the Glossa icon → Settings).

## Troubleshooting

- **"Language pack is not downloaded yet"**: open settings and click Download on that row.
- **"This Chrome has no built-in translator"**: update Chrome to 138 or newer. Chrome on phones isn't supported.
- **English proofreading says "Not supported"**: your computer doesn't meet Gemini Nano's requirements above. Translation still works.
- **Buttons stopped working after an update**: reload the chat page.

## Build from source

Needs [Bun](https://bun.sh).

```sh
bun install
bun run build          # Chrome: .output/chrome-mv3
bun run build:firefox  # Firefox: .output/firefox-mv2
bun run zip            # release zips in .output/
```

ds a missing pack shows a link back to settings.

## Development

```sh
bun run dev     # dev build with reload on change
bun run check   # type-check
```

Translation runs in an offscreen document (`entrypoints/offscreen`): the APIs only exist in window contexts and are blocked inside cross-origin iframes such as Google Chat in Gmail. Content scripts ask the background worker, which forwards to the offscreen page.

Site support lives in `lib/sites/`. Each adapter says where message text lives and whether a message is mine. These selectors are the part that breaks when a site changes its markup.
