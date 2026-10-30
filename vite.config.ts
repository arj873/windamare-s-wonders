import { defineConfig } from 'vite';

export default defineConfig({
  // '/' for Cloudflare/custom domain; set VITE_BASE=/<repo>/ for GitHub Pages project sites.
  base: process.env.VITE_BASE ?? '/',
});
