import { defineConfig } from 'vite';

// Relative assets also work at /REPOSITORY_NAME/ without guessing a remote name.
export default defineConfig({ base: './' });
