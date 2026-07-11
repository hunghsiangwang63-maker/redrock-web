import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const target = process.env.BUILD_TARGET || 'staff'

// 員工站專屬 favicon（會員站維持 /favicon.png 不動）：index.html 兩站共用，
// 故在 staff build 時把瀏覽器分頁 favicon 換成 /favicon-staff.png。
const staffFaviconPlugin = {
  name: 'staff-favicon',
  transformIndexHtml(html) {
    if (target !== 'staff') return html
    return html.replace(
      '<link rel="icon" type="image/png" href="/favicon.png" />',
      '<link rel="icon" type="image/png" href="/favicon-staff.png" />'
    )
  },
}

export default defineConfig({
  plugins: [react(), staffFaviconPlugin],
  define: {
    'import.meta.env.VITE_BUILD_TARGET': JSON.stringify(target),
  },
  build: {
    outDir: target === 'member' ? 'dist-member' : 'dist-staff',
  }
})
