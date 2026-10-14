# Glossa

Translate chat messages and selected text, and fix the English in your drafts. On Chrome it all runs on your device: no account, nothing sent anywhere.

| To | Do |
| --- | --- |
| Translate text on a page | Select it, then click the button or press **Alt+T** |
| Translate a chat message | Click its Translate button (Google Chat, Messenger, LinkedIn) |
| Translate your reply | **Alt+Enter** in the text box |
| Fix your English | **Alt+G** in the text box |
| Undo | **Ctrl+Z** |

## Install (Chrome 138+)

1. Download `glossa-<version>-chrome.zip` from the [latest release](https://github.com/tuzkituan/glossa/releases/latest) and unzip it somewhere you'll keep.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the folder.
3. In the settings page that opens, pick your languages and click **Download** on each language pack you need.

Fix English needs Gemini Nano (about 22 GB free disk, 16 GB RAM or a 4 GB+ GPU). To update, unzip the new version over the same folder and click reload in `chrome://extensions`.

## Firefox

Download `glossa-<version>-firefox.zip`, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick the zip. It's unsigned, so Firefox removes it on restart. Firefox sends text to Google Translate and LanguageTool when you ask.

## Development

```sh
bun install
bun run dev    # dev build with reload
bun run zip    # release zips in .output/
```

Site adapters live in `lib/sites/`; their selectors are what breaks when a site changes its markup.
