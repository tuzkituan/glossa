# Glossa

Chrome extension that translates chat messages and selected text on the device, using Chrome's built-in Translator and LanguageDetector APIs. No API keys, and no text leaves the browser.

- **Selection**: select text on any page and click the button that appears, or press Alt+T, or right-click → Translate.
- **Chat messages**: on Google Chat, Messenger/Facebook and LinkedIn, every message gets a Translate button (in the hover toolbar on Google Chat). Clicking it swaps the message for its translation in place, keeping mentions and formatting; click again for the original. A message already in your language is translated into your reply language.
- **Your reply**: type in your language in any text box and press Alt+Enter. The draft is replaced with the translation (Ctrl+Z restores it). On the chat sites it can reply in the language the other person writes in.
- **Fix English**: in any text box press Alt+G, or click the spellcheck button next to Translate on Google Chat. Spelling, grammar and punctuation in your English draft are corrected in place, keeping mentions and code names (Ctrl+Z restores it). Chrome uses Gemini Nano on the device; download it under **Language packs**. Firefox sends the draft to LanguageTool.
- **Toolbar popup**: translate typed text and turn the message buttons on or off for the current site.

Every language, site and shortcut is configurable in the settings page.

## Requirements

Desktop Chrome 138 or newer.

## Install

```sh
bun install
bun run build
```

Open `chrome://extensions`, enable Developer mode, click **Load unpacked** and pick `.output/chrome-mv3`.

The settings page opens on first install. Under **Language packs**, click **Download** for language detection and each pair you need. Chrome only allows downloads from a click, so pages can't trigger them; a page that needs a missing pack shows a link back to settings.

## Development

```sh
bun run dev     # dev build with reload on change
bun run check   # type-check
```

Translation runs in an offscreen document (`entrypoints/offscreen`): the APIs only exist in window contexts and are blocked inside cross-origin iframes such as Google Chat in Gmail. Content scripts ask the background worker, which forwards to the offscreen page.

Site support lives in `lib/sites/`. Each adapter says where message text lives and whether a message is mine. These selectors are the part that breaks when a site changes its markup.
