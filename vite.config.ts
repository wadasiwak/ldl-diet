import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 在每個 JS chunk 開頭加版權宣告（`/*!` 開頭的註解 minify 不會移除）
function copyrightBanner(): Plugin {
  return {
    name: 'copyright-banner',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk') {
          chunk.code = `/*! © 2026 wadasiwak. All rights reserved. */\n${chunk.code}`
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyrightBanner()],
  // Relative base so the static build works at any path (GitHub Pages
  // serves it under /ldl-diet/).
  base: './',
  server: { port: 5290 },
  preview: { port: 5290 },
})
