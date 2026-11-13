import { entryPath, findFile, normalizePath, relativeImports } from './entry.ts';
import type { Manifest } from './entry.ts';
import { fail } from './types.ts';
import type { Measurement } from './types.ts';

export type Tools = {
    gzipSize(data: Uint8Array): Promise<number>;
    /** Returns the minified code, throwing if `source` can’t be parsed. */
    minify(filename: string, source: string): string;
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/**
 * Measures a package’s own code: every file reachable from its entry through
 * relative imports, each minified, then gzipped together. Imports of other
 * packages are left for the caller to add up.
 */
export async function measureFiles(
    files: Map<string, Uint8Array>,
    tools: Tools,
): Promise<Measurement> {
    const manifestFile = files.get('package.json');
    if (!manifestFile) return fail('package.json is missing');
    let manifest: Manifest;
    try {
        manifest = JSON.parse(decoder.decode(manifestFile)) as Manifest;
    } catch {
        return fail('package.json is not valid JSON');
    }

    const entryTarget = normalizePath(entryPath(manifest));
    const entry = entryTarget === undefined ? undefined : findFile(files, entryTarget);
    if (!entry) return fail('entry file is missing or isn’t JavaScript');

    const minified: string[] = [];
    const seen = new Set<string>();
    const queue = [entry];
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        if (seen.has(file)) continue;
        seen.add(file);
        const source = decoder.decode(files.get(file));
        try {
            minified.push(tools.minify(file, source));
        } catch (error) {
            return fail(`couldn’t minify ${file}: ${(error as Error).message}`);
        }
        for (const specifier of relativeImports(source)) {
            const target = normalizePath(`${file.replace(/[^/]*$/, '')}${specifier}`);
            const found = target === undefined ? undefined : findFile(files, target);
            if (found) queue.push(found);
        }
    }

    const bytes = encoder.encode(minified.join('\n'));
    return {
        dependencies: manifest.dependencies ?? {},
        ok: true,
        own: { gzip: await tools.gzipSize(bytes), min: bytes.length },
    };
}
