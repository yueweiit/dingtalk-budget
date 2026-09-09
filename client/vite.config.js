import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // The local integration launcher supplies a dedicated backend per worktree.
  // Prefer its process-level override before falling back to checked-in defaults.
  const apiTarget = process.env.VITE_DEV_API_TARGET || env.VITE_DEV_API_TARGET || 'http://localhost:3001';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: '0.0.0.0',  // 监听所有网络接口
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
