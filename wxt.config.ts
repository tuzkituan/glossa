import { defineConfig } from 'wxt';

const PROOFREAD_HOSTS = ['https://api.languagetool.org/*', 'https://generativelanguage.googleapis.com/*'];

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Glossa',
    description:
      browser === 'firefox'
        ? 'Translate chats and selected text with Google Translate, and fix your English'
        : 'On-device translation for chats and selected text, and English fixes for your drafts',
    permissions:
      browser === 'firefox'
        ? ['storage', 'contextMenus', 'activeTab', 'https://clients5.google.com/*', ...PROOFREAD_HOSTS]
        : ['storage', 'offscreen', 'contextMenus', 'activeTab'],
    // Fix English: LanguageTool, or Gemini with your key.
    ...(browser !== 'firefox' && { host_permissions: PROOFREAD_HOSTS }),
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'glossa@tuzkituan',
          strict_min_version: '115.0',
          // Text you choose to translate goes to Google Translate; text you fix goes to LanguageTool or Gemini.
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
