import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Glossa',
    description:
      browser === 'firefox'
        ? 'Translate chats and selected text with Google Translate, and fix your English'
        : 'On-device translation for chats and selected text, and English fixes for your drafts',
    permissions:
      browser === 'firefox'
        ? ['storage', 'contextMenus', 'activeTab', 'https://clients5.google.com/*', 'https://api.languagetool.org/*']
        : ['storage', 'offscreen', 'contextMenus', 'activeTab'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'glossa@tuzkituan',
          strict_min_version: '115.0',
          // Text you choose to translate goes to Google Translate; text you fix goes to LanguageTool.
          data_collection_permissions: { required: ['websiteContent', 'personalCommunications'] },
        },
      },
    }),
    commands: {
      'translate-selection': {
        suggested_key: { default: 'Alt+T' },
        description: 'Translate the selected text',
      },
    },
  }),
});
