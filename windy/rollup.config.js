/*
 * rollup.config.js — build del plugin Patera Alert (sistema Windy v42+).
 * Adaptado del template oficial windycom/windy-plugin-template v5:
 * mismo pipeline (svelte + swc + resolve + commonjs + transformCodeToESMPlugin)
 * pero con input 'plugin.svelte' en este directorio y reutilizando
 * ../motor.js sin modificarlo (plugin commonjs lo empaqueta tal cual).
 *
 * Uso:
 *   cd windy && npm install
 *   npm start   -> sirve https://localhost:9999/plugin.js (watch)
 *   npm run build -> genera dist/plugin.js y dist/plugin.min.js
 */
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

import serve from 'rollup-plugin-serve';
import rollupSvelte from 'rollup-plugin-svelte';
import rollupSwc from 'rollup-plugin-swc3';
import rollupCleanup from 'rollup-plugin-cleanup';

import { less } from 'svelte-preprocess-less';
import sveltePreprocess from 'svelte-preprocess';

import { transformCodeToESMPlugin, keyPEM, certificatePEM } from '@windycom/plugin-devtools';

const useSourceMaps = true;

export default {
    input: 'plugin.svelte',
    output: [
        {
            file: 'dist/plugin.js',
            format: 'module',
            sourcemap: true,
        },
        {
            file: 'dist/plugin.min.js',
            format: 'module',
            plugins: [rollupCleanup({ comments: 'none', extensions: ['ts'] }), terser()],
        },
    ],

    onwarn: () => {
        /* Silenciamos warnings como en el template oficial */
    },
    external: id => id.startsWith('@windy/'),
    watch: {
        include: ['plugin.svelte', 'pluginConfig.ts', '../motor.js'],
        exclude: 'node_modules/**',
        clearScreen: false,
    },
    plugins: [
        rollupSvelte({
            emitCss: false,
            preprocess: {
                style: less({
                    sourceMap: false,
                    math: 'always',
                }),
                script: data => {
                    const preprocessed = sveltePreprocess({ sourceMap: useSourceMaps });
                    return preprocessed.script(data);
                },
            },
        }),
        rollupSwc({
            include: ['**/*.ts', '**/*.svelte'],
            sourceMaps: useSourceMaps,
        }),
        resolve({
            browser: true,
            mainFields: ['module', 'jsnext:main', 'main'],
            preferBuiltins: false,
            dedupe: ['svelte'],
        }),
        commonjs(),
        transformCodeToESMPlugin(),
        process.env.SERVE !== 'false' &&
            serve({
                contentBase: 'dist',
                host: '0.0.0.0',
                port: 9999,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                https: {
                    key: keyPEM,
                    cert: certificatePEM,
                },
            }),
    ],
};
