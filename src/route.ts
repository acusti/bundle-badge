export type Format = 'min' | 'minzip';

export type Target = { format: Format; name: string; spec: string };

const NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/;

/**
 * Reads `/<format>/<name>[/<version>]`, where `name` may be scoped
 * (`@scope/name`) and `version` is a version, range, or dist-tag.
 * Returns undefined for anything else.
 */
export function parseRoute(pathname: string): Target | undefined {
    let segments: string[];
    try {
        segments = pathname
            .replace(/\.svg$/, '')
            .split('/')
            .filter(Boolean)
            .map(decodeURIComponent);
    } catch {
        return;
    }
    const [format, ...rest] = segments;
    if (format !== 'min' && format !== 'minzip') return;
    // `%2F` in a scoped name arrives as one segment; normalize either form
    const parts = rest.flatMap((segment, index) =>
        index === 0 ? segment.split('/') : [segment],
    );
    const scoped = parts[0]?.startsWith('@');
    const name = scoped ? parts.slice(0, 2).join('/') : parts[0];
    const extra = parts.slice(scoped ? 2 : 1);
    if (!name || !NAME.test(name) || extra.length > 1) return;
    return { format, name, spec: extra[0] ?? 'latest' };
}
