import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Dev pages (like Catan's ui-dev.html) are extra entries.
const pages = ['index.html', 'art-dev.html'];

export default defineConfig({
  // '/' for Cloudflare/custom domain; set VITE_BASE=/<repo>/ for GitHub Pages project sites.
  base: process.env.VITE_BASE ?? '/',
  build: {
    rolldownOptions: {
      input: Object.fromEntries(pages.map((f) => [f.replace('.html', ''), resolve(__dirname, f)])),
    },
  },
});
