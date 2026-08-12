import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

// 版本偵測：每次 build 產生一組唯一 buildId（git commit + 時間戳），同時
// ①內嵌進這次打包的 JS（VITE_BUILD_ID，供執行中的 App 知道自己是哪個版本）
// ②寫成 dist 根目錄的 version.json（供執行中的 App 定期打去問「線上現在是哪個版本」）。
// 兩者用同一個變數算出，保證一致；version.json 屬於 firebase.json 裡 source:'**' no-cache
// 規則涵蓋的靜態檔（非 /assets/**），每次請求都會重新驗證，不會被瀏覽器快取卡住。
// 見 src/components/UpdateChecker.jsx——比對這兩個值，不同就提示重新整理。
let gitHash = 'nogit'
try { gitHash = execSync('git rev-parse --short HEAD').toString().trim() } catch {}
const buildId = `${gitHash}-${Date.now()}`

const buildVersionPlugin = {
  name: 'build-version',
  writeBundle() {
    const outDir = target === 'member' ? 'dist-member' : 'dist-staff'
    writeFileSync(resolve(outDir, 'version.json'), JSON.stringify({ buildId }))
  },
}

export default defineConfig({
  plugins: [react(), staffFaviconPlugin, buildVersionPlugin],
  define: {
    'import.meta.env.VITE_BUILD_TARGET': JSON.stringify(target),
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
  },
  build: {
    outDir: target === 'member' ? 'dist-member' : 'dist-staff',
  }
})
