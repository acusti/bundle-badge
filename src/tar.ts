const decoder = new TextDecoder();

const field = (bytes: Uint8Array, start: number, length: number) =>
    decoder.decode(bytes.subarray(start, start + length)).replace(/\0.*$/s, '');

/**
 * Reads the regular files out of an uncompressed tar archive, keyed by path
 * with the archive’s single root directory (npm uses `package/`) removed.
 */
export function untar(bytes: Uint8Array): Map<string, Uint8Array> {
    const files = new Map<string, Uint8Array>();
    let offset = 0;
    let longName: string | undefined;
    while (offset + 512 <= bytes.length) {
        const header = bytes.subarray(offset, offset + 512);
        if (header.every((byte) => byte === 0)) break;

        const size = parseInt(field(header, 124, 12).trim() || '0', 8);
        const type = String.fromCharCode(header[156]);
        offset += 512;
        const body = bytes.subarray(offset, offset + size);
        offset += Math.ceil(size / 512) * 512;

        // pax (`x`) and GNU (`L`) headers carry the real path of the next entry
        if (type === 'x') {
            longName = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(decoder.decode(body))?.[1];
            continue;
        }
        if (type === 'L') {
            longName = field(body, 0, body.length);
            continue;
        }
        if (type !== '0' && type !== '\0') continue;

        const prefix = field(header, 345, 155);
        const name = field(header, 0, 100);
        const path = longName ?? (prefix ? `${prefix}/${name}` : name);
        longName = undefined;
        files.set(path.replace(/^[^/]*\//, ''), body);
    }
    return files;
}

export class TooLargeError extends Error {}

/** Gunzips a stream, giving up once the output passes `maxBytes`. */
export async function gunzip(
    body: ReadableStream<Uint8Array>,
    maxBytes: number,
): Promise<Uint8Array> {
    const reader = body
        .pipeThrough(
            new DecompressionStream('gzip') as ReadableWritablePair<
                Uint8Array,
                Uint8Array
            >,
        )
        .getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
            await reader.cancel();
            throw new TooLargeError(`more than ${maxBytes} bytes unpacked`);
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
    }
    return bytes;
}

/** The gzipped size of `data`, counted without keeping the output. */
export async function gzipSize(data: Uint8Array): Promise<number> {
    const reader = new Blob([data as BlobPart])
        .stream()
        .pipeThrough(
            new CompressionStream('gzip') as ReadableWritablePair<Uint8Array, Uint8Array>,
        )
        .getReader();
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return total;
        total += value.length;
    }
}
