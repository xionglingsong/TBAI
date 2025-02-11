import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/TBAI/',  // 设置基础路径为仓库名
  build: {
    outDir: 'dist',  // 构建输出目录
    assetsDir: 'assets',  // 静态资源目录
    sourcemap: false  // 生产环境不生成sourcemap
  }
})