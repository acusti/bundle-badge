export type Format = 'min' | 'minzip';

export type Target = { format: Format; name: string; spec: string };

export type PageTarget = { name: string; spec: string };

const NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/;

/**
 * Reads `/<format>/<name>[/<version>]`, where `name` may be scoped
 * (`@scope/name`) and `version` is a version, range, or dist-tag.
 * Returns undefined for anything else.
 */
export function parseRoute(pathname: string): Target | undefined {
    const segments = splitPath(pathname.replace(/\.svg$/, ''));
    if (!segments) return;
    const [format, ...rest] = segments;
    if (format !== 'min' && format !== 'minzip') return;
    const target = parsePackage(rest);
    return target && { format, ...target };
}

/** Reads `/package/<name>[/<version>]`, the HTML page for a package. */
export function parsePageRoute(pathname: string): PageTarget | undefined {
    const segments = splitPath(pathname);
    if (!segments || segments[0] !== 'package') return;
    return parsePackage(segments.slice(1));
}

function splitPath(pathname: string): string[] | undefined {
    try {
        return pathname.split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
        return;
    }
}

function parsePackage(rest: string[]): PageTarget | undefined {
    // `%2F` in a scoped name arrives as one segment; normalize either form
    const parts = rest.flatMap((segment, index) =>
        index === 0 ? segment.split('/') : [segment],
    );
    const scoped = parts[0]?.startsWith('@');
    const name = scoped ? parts.slice(0, 2).join('/') : parts[0];
    const extra = parts.slice(scoped ? 2 : 1);
    if (!name || !NAME.test(name) || extra.length > 1) return;
    return { name, spec: extra[0] ?? 'latest' };
}
