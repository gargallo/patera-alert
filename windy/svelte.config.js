/*
 * svelte.config.js — solo para tooling de editor (svelte-language-server).
 * El build real se configura en rollup.config.js.
 */
import sveltePreprocess from 'svelte-preprocess';

export default {
    preprocess: sveltePreprocess(),
};
