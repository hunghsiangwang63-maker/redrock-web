import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const target = process.env.BUILD_TARGET || 'staff'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_TARGET': JSON.stringify(target),
  },
  build: {
    outDir: target === 'member' ? 'dist-member' : 'dist-staff',
  }
})
