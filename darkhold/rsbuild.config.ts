import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  server: {
    proxy: {
      '/api': {
        target: process.env.TANDOOR_URL || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  html: {
    template: './public/index.html',
  },
});
