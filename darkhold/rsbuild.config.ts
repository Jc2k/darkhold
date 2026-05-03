import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.TANDOOR_URL || 'http://localhost:8080',
        changeOrigin: true,
      },
      '/media': {
        target: process.env.TANDOOR_URL || 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8098',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  html: {
    template: './public/index.html',
  },
});
