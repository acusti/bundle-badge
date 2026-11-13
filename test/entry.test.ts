import { describe, expect, it } from 'vitest';
import { entryPath, findFile, normalizePath, relativeImports } from '../src/entry.ts';

describe('entryPath', () => {
    it('follows an exports string or the "." entry', () => {
        expect(entryPath({ exports: './dist/a.js' })).toBe('./dist/a.js');
        expect(entryPath({ exports: { '.': './dist/b.js', './x': './x.js' } })).toBe(
            './dist/b.js',
        );
    });

    it('takes the first condition a browser build uses, in key order', () => {
        expect(
            entryPath({
                exports: {
                    '.': {
                        types: './a.d.ts',
                        require: './a.cjs',
                        import: './a.mjs',
                        default: './a.js',
                    },
                },
            }),
        ).toBe('./a.mjs');
        expect(
            entryPath({
                exports: {
                    node: './node.js',
                    browser: './browser.js',
                    default: './d.js',
                },
            }),
        ).toBe('./browser.js');
    });

    it('falls back through arrays, browser, module, main, then index.js', () => {
        expect(
            entryPath({ exports: { '.': [{ node: './n.js' }, './fallback.js'] } }),
        ).toBe('./fallback.js');
        expect(entryPath({ browser: './b.js', main: './m.js', module: './mod.js' })).toBe(
            './b.js',
        );
        expect(entryPath({ main: './m.js', module: './mod.js' })).toBe('./mod.js');
        expect(entryPath({ main: './m.js' })).toBe('./m.js');
        expect(entryPath({})).toBe('index.js');
    });
});

describe('normalizePath', () => {
    it('resolves dots and refuses to leave the package', () => {
        expect(normalizePath('./dist/../lib/a.js')).toBe('lib/a.js');
        expect(normalizePath('../outside.js')).toBeUndefined();
    });
});

describe('findFile', () => {
    const files = new Map([
        ['a.js', 1],
        ['b/index.js', 1],
        ['c.json', 1],
        ['d.mjs', 1],
    ]);
    it('tries the path, then .js, then /index.js, and only finds scripts', () => {
        expect(findFile(files, 'a')).toBe('a.js');
        expect(findFile(files, 'b')).toBe('b/index.js');
        expect(findFile(files, 'd.mjs')).toBe('d.mjs');
        expect(findFile(files, 'c.json')).toBeUndefined();
    });
});

describe('relativeImports', () => {
    it('finds static imports, re-exports, and requires of relative files', () => {
        const source = `
            import a from "./a.js";
            import "./side-effect.js";
            export { b } from '../b';
            const c = require("./c");
            import pkg from "react";
            const lazy = () => import("./lazy.js");
        `;
        expect(relativeImports(source)).toEqual([
            './a.js',
            './side-effect.js',
            '../b',
            './c',
        ]);
    });
});
