import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
// BASE_URL: set via env var for GitHub Pages (e.g. /my-repo/).
// Leave empty for custom domain or Vercel/Netlify deploys.
export default defineConfig({
  base: process.env.BASE_URL ?? '/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
