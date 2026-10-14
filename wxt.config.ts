import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Glossa',
    description: 'On-device translation for chats and selected text',
    permissions: ['storage', 'offscreen', 'contextMenus', 'activeTab'],
    commands: {
      'translate-selection': {
        suggested_key: { default: 'Alt+T' },
        description: 'Translate the selected text',
      },
    },
  },
});
