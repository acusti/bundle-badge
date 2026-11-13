import { describe, expect, it } from 'vitest';
import { measureFiles } from '../src/bundle.ts';
import type { Tools } from '../src/bundle.ts';

const encoder = new TextEncoder();
const files = (record: Record<string, string>) =>
    new Map(Object.entries(record).map(([path, text]) => [path, encoder.encode(text)]));

// Pretends minifying halves a file; “gzip” is a tenth of the input
const tools: Tools = {
    gzipSize: async (data) => Math.ceil(data.length / 10),
    minify(filename, source) {
        if (source.includes('SYNTAX ERROR')) throw new Error('unexpected token');
        return source.slice(0, Math.ceil(source.length / 2));
    },
};

describe('measureFiles', () => {
    it('adds up every file reachable from the entry, each once', async () => {
        const result = await measureFiles(
            files({
                'dist/a.js': `import "./b.js"; import "./c.js"; ${'x'.repeat(100)}`,
                'dist/b.js': `import "./c.js"; ${'y'.repeat(100)}`,
                'dist/c.js': 'z'.repeat(100),
                'dist/unused.js': 'u'.repeat(1000),
                'package.json': JSON.stringify({
                    dependencies: { clsx: '^2' },
                    exports: './dist/a.js',
                }),
            }),
            tools,
        );
        expect(result).toMatchObject({
            dependencies: { clsx: '^2' },
            ok: true,
            own: { min: 67 + 59 + 50 + 2 },
        });
    });

    it('fails when there is nothing to measure', async () => {
        expect(await measureFiles(files({}), tools)).toMatchObject({ ok: false });
        expect(
            await measureFiles(files({ 'package.json': '{"main":"index.node"}' }), tools),
        ).toMatchObject({ ok: false, reason: expect.stringContaining('entry') });
        expect(await measureFiles(files({ 'package.json': '{' }), tools)).toMatchObject({
            ok: false,
        });
    });

    it('fails with the file name when minifying throws', async () => {
        const result = await measureFiles(
            files({ 'index.js': 'SYNTAX ERROR', 'package.json': '{}' }),
            tools,
        );
        expect(result).toMatchObject({
            ok: false,
            reason: expect.stringContaining('index.js'),
        });
    });
});
