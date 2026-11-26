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

/** GitHub のリポジトリ名（GitHub Pages では https://<ユーザー名>.github.io/<リポジトリ名>/ で公開される） */
const REPO_NAME = 'formula-derby';

/**
 * 公開パス（base）。
 *  - GitHub Pages 用のビルド（環境変数 GITHUB_PAGES=true。.github/workflows/deploy.yml で設定）：'/<リポジトリ名>/'
 *    （リポジトリ名が <ユーザー名>.github.io ならルート公開なので '/'）
 *  - それ以外（ローカルの npm run build）：'./' のまま。dist/index.html を file:// で直接開いても動くように
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env.GITHUB_PAGES === 'true' ? (REPO_NAME.endsWith('.github.io') ? '/' : `/${REPO_NAME}/`) : './';

export default defineConfig({
  base,
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
