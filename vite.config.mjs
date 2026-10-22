import { defineConfig } from 'vite';

// The site is published to GitHub Pages as a project page (/art-morph/), so
// asset URLs are emitted relative ('./') rather than root-absolute: the build
// works under any base path, as the previous webpack build did.
// Output stays in dist/ because `npm run deploy` publishes that folder.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.mjs'],
  },
});
