import { defineConfig, type Plugin } from 'vite';

/**
 * dist/index.html を file:// で直接開いても動くようにするプラグイン。
 * ブラウザは file:// 上の <script type="module"> を CORS でブロックするため、
 * バンドルを IIFE（単一ファイル）で出力し、通常の defer スクリプトとして読み込ませる。
 */
function classicScriptForFileProtocol(): Plugin {
  return {
    name: 'classic-script-for-file-protocol',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/<script type="module" crossorigin/g, '<script defer');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [classicScriptForFileProtocol()],
  build: {
    outDir: 'dist',
    modulePreload: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        format: 'iife',
      },
    },
  },
});
