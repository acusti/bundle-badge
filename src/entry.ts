/** The `package.json` fields that decide which file a bundler starts from. */
export type Manifest = {
    browser?: unknown;
    dependencies?: Record<string, string>;
    exports?: unknown;
    main?: unknown;
    module?: unknown;
};

// What a Vite browser build asks for; the first key of a conditions object
// that is in this set wins, as with Node’s resolution.
const CONDITIONS = new Set(['browser', 'import', 'module', 'production', 'default']);

function fromExports(target: unknown): string | undefined {
    if (typeof target === 'string') return target;
    if (Array.isArray(target)) {
        for (const item of target) {
            const found = fromExports(item);
            if (found) return found;
        }
        return;
    }
    if (target != null && typeof target === 'object') {
        for (const [condition, value] of Object.entries(target)) {
            if (!CONDITIONS.has(condition)) continue;
            const found = fromExports(value);
            if (found) return found;
        }
    }
}

/** The path (relative to the package root) of the file a bundler imports first. */
export function entryPath(manifest: Manifest): string {
    const { exports } = manifest;
    let target = exports;
    if (
        exports != null &&
        typeof exports === 'object' &&
        !Array.isArray(exports) &&
        Object.keys(exports).some((key) => key.startsWith('.'))
    ) {
        target = (exports as Record<string, unknown>)['.'];
    }
    const fromMap = fromExports(target);
    if (fromMap) return fromMap;
    for (const field of [manifest.browser, manifest.module, manifest.main]) {
        if (typeof field === 'string' && field) return field;
    }
    return 'index.js';
}

/** Normalizes `./a/../b.js` to `b.js`; returns undefined if it leaves the package. */
export function normalizePath(path: string): string | undefined {
    const parts: string[] = [];
    for (const part of path.split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..') {
            if (!parts.pop()) return;
        } else {
            parts.push(part);
        }
    }
    return parts.join('/');
}

export const isScript = (path: string) => /\.[cm]?js$/.test(path);

/** Finds `path` in `files` the way a bundler would: as is, then `.js`, then `/index.js`. */
export function findFile(files: Map<string, unknown>, path: string): string | undefined {
    return [path, `${path}.js`, `${path}/index.js`].find(
        (candidate) => files.has(candidate) && isScript(candidate),
    );
}

// Static imports and requires of relative files, not dynamic `import()`s,
// which a bundler splits into a chunk that isn’t loaded up front.
const RELATIVE_IMPORT =
    /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g;

export function relativeImports(source: string): string[] {
    return Array.from(source.matchAll(RELATIVE_IMPORT), (match) => match[1]);
}
