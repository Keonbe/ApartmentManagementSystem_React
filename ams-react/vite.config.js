import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
    server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080', // Your XAMPP Apache server base URL
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/ApartmentManagementSystem_React'), 
      }
    }
  }
})
