import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { TooLargeError, gunzip, gzipSize, untar } from '../src/tar.ts';

const encoder = new TextEncoder();

function entry(path: string, content: string, type = '0'): Uint8Array {
    const body = encoder.encode(content);
    const header = new Uint8Array(512);
    header.set(encoder.encode(path).subarray(0, 100), 0);
    header.set(encoder.encode(`${body.length.toString(8).padStart(11, '0')}\0`), 124);
    header[156] = type.charCodeAt(0);
    const padded = new Uint8Array(Math.ceil(body.length / 512) * 512);
    padded.set(body);
    return new Uint8Array([...header, ...padded]);
}

const archive = (...entries: Uint8Array[]) =>
    new Uint8Array([...entries.flatMap((e) => [...e]), ...new Uint8Array(1024)]);

const stream = (bytes: Uint8Array) =>
    new Blob([bytes as BlobPart]).stream() as ReadableStream<Uint8Array>;

describe('untar', () => {
    it('reads files, dropping the root directory and non-files', () => {
        const files = untar(
            archive(
                entry('package/', '', '5'),
                entry('package/package.json', '{"name":"a"}'),
                entry('package/dist/index.js', 'x'.repeat(700)),
            ),
        );
        expect([...files.keys()]).toEqual(['package.json', 'dist/index.js']);
        expect(new TextDecoder().decode(files.get('package.json'))).toBe('{"name":"a"}');
        expect(files.get('dist/index.js')?.length).toBe(700);
    });

    it('uses the path from a pax header for the entry after it', () => {
        const long = `package/${'d/'.repeat(60)}file.js`;
        const record = ` path=${long}\n`;
        const pax = `${record.length + String(record.length).length} path=${long}\n`;
        const files = untar(archive(entry('PaxHeader', pax, 'x'), entry('short', 'ok')));
        expect(files.get(`${'d/'.repeat(60)}file.js`)).toBeDefined();
    });
});

describe('gunzip', () => {
    it('inflates a stream', async () => {
        const out = await gunzip(stream(gzipSync('hello')), 100);
        expect(new TextDecoder().decode(out)).toBe('hello');
    });

    it('stops once the output exceeds the limit', async () => {
        await expect(
            gunzip(stream(gzipSync('a'.repeat(10_000))), 100),
        ).rejects.toBeInstanceOf(TooLargeError);
    });
});

describe('gzipSize', () => {
    it('counts the bytes of the gzipped output', async () => {
        const data = encoder.encode('abc'.repeat(1000));
        const size = await gzipSize(data);
        expect(size).toBeGreaterThan(10);
        expect(size).toBeLessThan(100);
    });
});
