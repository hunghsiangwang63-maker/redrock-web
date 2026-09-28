import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { createHash } from 'node:crypto'

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

// 版本偵測：buildId 內嵌進這次打包的 JS（VITE_BUILD_ID）＋寫成 dist 根目錄的
// version.json，兩者用同一個變數算出、保證一致；version.json 屬於 firebase.json 裡
// source:'**' no-cache 規則涵蓋的靜態檔（非 /assets/**），每次請求都會重新驗證。
// 見 src/components/UpdateChecker.jsx——執行中的頁面定期拿自己內嵌的值去比對線上
// version.json，不同就提示「發現新版本」。
//
// buildId 改用「原始碼內容 hash」，不用「git commit + 時間戳」：舊做法只要重新
// build+deploy（哪怕程式碼一字未改）就會換一組新 buildId，導致部署密集期間開著的
// 分頁一直被誤判「有新版本」（2026-09-28 已於實際使用中發生）。改成對決定打包結果
// 的來源（src/、public/、index.html、本檔、package.json）逐檔算 sha256——同樣的
// 原始碼永遠得到同一個 hash（不管重 build 幾次、在什麼時間點 build），真的有程式碼
// 變動才會換一組新值，UpdateChecker.jsx 的比對邏輯完全不用改。
// 不對「打包後的 dist 輸出」算 hash：那份輸出本身就內嵌了這個 buildId，用輸出反過來
// 算輸入是雞生蛋蛋生雞、永遠對不齊。
// 用檔案系統直接走訪（不用 `git ls-tree` 之類的 git 樹狀 hash）是刻意的：這個專案的
// 既有慣例允許 build+deploy 發生在 git commit 之前（CLAUDE.md 記過好幾次「deploy 完
// 才發現忘記 commit」）——若改用 git 狀態算 hash，同一個 commit 下兩次改了尚未進版控
// 的檔案、各自重新 build+deploy，會被誤判成同一個版本、該跳的提示反而不會跳；直接讀
// 磁碟上這一刻的實際內容，才會準確對應「這次真的部署了什麼」。
function hashSourceTree() {
  const hash = createHash('sha256')
  const roots = ['src', 'public', 'index.html', 'vite.config.js', 'package.json']
  const walk = (path, baseDir) => {
    const stat = statSync(path)
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path).sort()) walk(join(path, entry), baseDir)
    } else if (stat.isFile()) {
      hash.update(relative(baseDir, path).split('\\').join('/'))
      hash.update(readFileSync(path))
    }
  }
  for (const root of roots) {
    try { walk(resolve(process.cwd(), root), process.cwd()) } catch {}
  }
  return hash.digest('hex').slice(0, 16)
}

const buildId = `${target}-${hashSourceTree()}`

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
