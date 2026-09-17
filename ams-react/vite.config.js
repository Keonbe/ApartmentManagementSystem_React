import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { deployGuard } from './scripts/deploy-guard.mjs'

// https://vite.dev/config/
// The build target is the Vite mode (npm run build:local | build:saas |
// build:selfhosted); deployGuard() validates that mode's .env file and fails a
// production build that still contains localhost URLs.
export default defineConfig({
  plugins: [react(), tailwindcss(), deployGuard()],
    server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080', // Your XAMPP Apache server base URL
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/Capstone/ApartmentManagementSystem_React'),
      }
    }
  }
})
