import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

/** For the test run only — the package ships source and has no build step of its own. The plugin is
 *  what compiles `.svelte` and the `.svelte.ts` rune modules the store is written in. */
export default defineConfig({ plugins: [svelte()] });
