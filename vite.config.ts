import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { build } from 'vite';

// Custom plugin to handle Chrome extension build
function chromeExtensionPlugin() {
  return {
    name: 'chrome-extension',
    async writeBundle() {
      const distDir = resolve(__dirname, 'dist');

      // Copy manifest.json
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(distDir, 'manifest.json')
      );

      // Copy content.css to dist/content/
      const contentCssDir = resolve(distDir, 'content');
      if (!existsSync(contentCssDir)) {
        mkdirSync(contentCssDir, { recursive: true });
      }
      copyFileSync(
        resolve(__dirname, 'src/content/content.css'),
        resolve(contentCssDir, 'content.css')
      );

      // Copy icons to dist/assets/icons/
      const iconsDir = resolve(distDir, 'assets/icons');
      if (!existsSync(iconsDir)) {
        mkdirSync(iconsDir, { recursive: true });
      }
      const srcIcons = resolve(__dirname, 'assets/icons');
      ['icon-16.png', 'icon-48.png', 'icon-128.png'].forEach(icon => {
        const src = resolve(srcIcons, icon);
        if (existsSync(src)) {
          copyFileSync(src, resolve(iconsDir, icon));
        }
      });

      // Move and fix HTML from dist/src/popup to dist/popup
      const srcPopupHtml = resolve(distDir, 'src/popup/index.html');
      const destPopupHtml = resolve(distDir, 'popup/index.html');
      if (existsSync(srcPopupHtml)) {
        let html = readFileSync(srcPopupHtml, 'utf-8');
        // Fix paths to be relative (Chrome extension requirement)
        html = html.replace(/src="\/popup\//g, 'src="./');
        html = html.replace(/href="\/popup\//g, 'href="./');
        writeFileSync(destPopupHtml, html);
        // Clean up the src folder
        rmSync(resolve(distDir, 'src'), { recursive: true, force: true });
      }

      // Build content script separately as IIFE (no ES modules)
      await build({
        configFile: false,
        build: {
          outDir: resolve(distDir, 'content'),
          emptyOutDir: false,
          lib: {
            entry: resolve(__dirname, 'src/content/index.ts'),
            name: 'GlideContent',
            formats: ['iife'],
            fileName: () => 'index.js',
          },
          rollupOptions: {
            output: {
              extend: true,
            },
          },
          minify: true,
          sourcemap: false,
        },
      });

      // Clean up extra assets folder from content build
      const contentAssetsDir = resolve(distDir, 'content/assets');
      if (existsSync(contentAssetsDir)) {
        rmSync(contentAssetsDir, { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), chromeExtensionPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    modulePreload: false, // Disable - polyfill uses `document` which breaks service workers
    rollupOptions: {
      input: {
        'popup/index': resolve(__dirname, 'src/popup/index.html'),
        'background/index': resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'shared/[name].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          if (name.endsWith('.css')) {
            return 'popup/style.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
});
