import { maxSatisfying, valid, validRange } from 'semver';
import { measureFiles } from './bundle.ts';
import type { Tools } from './bundle.ts';
import { TooLargeError, gunzip, untar } from './tar.ts';
import { fail } from './types.ts';
import type { Failure, Measurement } from './types.ts';
import type { Source } from './size.ts';

const REGISTRY = 'https://registry.npmjs.org';

/** Largest tarball (as downloaded) and unpacked size we will look at. */
const MAX_TARBALL_BYTES = 5 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 25 * 1024 * 1024;

type Packument = {
    'dist-tags'?: Record<string, string>;
    versions?: Record<string, unknown>;
};

const encodeName = (name: string) => name.replace('/', '%2F');

/** The registry’s abbreviated packument, cached at the edge for a few minutes. */
async function packument(name: string): Promise<Failure | Packument> {
    const response = await fetch(`${REGISTRY}/${encodeName(name)}`, {
        cf: { cacheEverything: true, cacheTtl: 300 },
        headers: { Accept: 'application/vnd.npm.install-v1+json' },
    });
    if (response.status === 404) return fail(`${name} isn’t on npm`);
    if (!response.ok) return fail(`npm registry returned ${response.status}`, true);
    return (await response.json()) as Packument;
}

export function resolveVersion(document: Packument, spec: string): Failure | string {
    const tags = document['dist-tags'] ?? {};
    const versions = Object.keys(document.versions ?? {});
    const tagged = tags[spec === '' ? 'latest' : spec];
    if (tagged) return tagged;
    if (valid(spec) && versions.includes(valid(spec)!)) return valid(spec)!;
    if (validRange(spec)) {
        const best = maxSatisfying(versions, spec);
        if (best) return best;
        return fail(`no version matches ${spec}`);
    }
    return fail(`can’t resolve ${spec}`);
}

export function createSource(tools: Tools): Source {
    return {
        async measure(name, version): Promise<Measurement> {
            const base = name.slice(name.lastIndexOf('/') + 1);
            const response = await fetch(`${REGISTRY}/${name}/-/${base}-${version}.tgz`, {
                cf: { cacheEverything: true, cacheTtl: 86_400 },
            });
            if (response.status === 404) return fail(`${name}@${version} isn’t on npm`);
            if (!response.ok || !response.body) {
                return fail(`npm registry returned ${response.status}`, true);
            }
            if (Number(response.headers.get('content-length')) > MAX_TARBALL_BYTES) {
                return fail('package is too large to measure');
            }
            try {
                const files = untar(await gunzip(response.body, MAX_UNPACKED_BYTES));
                return await measureFiles(files, tools);
            } catch (error) {
                if (error instanceof TooLargeError)
                    return fail('package is too large to measure');
                return fail(
                    `couldn’t read the package: ${(error as Error).message}`,
                    true,
                );
            }
        },

        async resolve(name, spec): Promise<Failure | string> {
            // An exact version needs no lookup
            const exact = valid(spec);
            if (exact === spec) return exact;
            const document = await packument(name);
            if ('ok' in document) return document;
            return resolveVersion(document, spec);
        },
    };
}
