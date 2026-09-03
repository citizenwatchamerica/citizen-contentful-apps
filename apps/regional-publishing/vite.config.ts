import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  base: '', // relative paths
  server: {
    port: 3000,
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'contentful-f36': ['@contentful/f36-components', '@contentful/f36-tokens'],
          'contentful-vendor': ['@contentful/app-sdk', '@contentful/react-apps-toolkit'],
          'contentful-management': ['contentful-management'],
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
  },
}));
