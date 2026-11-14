import { ALGORITHM } from '../src/size.ts';
import type { Cache, Env, Source } from '../src/size.ts';
import { fail } from '../src/types.ts';
import type { Measurement, SizeResult } from '../src/types.ts';

export const key = (id: string) => `${ALGORITHM}:${id}`;

export function memoryCache() {
    const store = new Map<string, SizeResult>();
    const cache: Cache = {
        get: async (k) => store.get(k) ?? null,
        put: async (k, result) => void store.set(k, result),
    };
    return { cache, store };
}

type Package = { dependencies?: Record<string, string>; size: number };

/** A registry of `name@version` packages; a package’s `min` is `size` and `gzip` half that. */
export function fakeEnv(
    packages: Record<string, Package | undefined>,
    admit: () => Promise<boolean> = async () => true,
) {
    const { cache, store } = memoryCache();
    const measured: string[] = [];
    const source: Source = {
        async measure(name, version): Promise<Measurement> {
            measured.push(`${name}@${version}`);
            const found = packages[`${name}@${version}`];
            if (!found) return fail('not on npm');
            return {
                dependencies: found.dependencies ?? {},
                ok: true,
                own: { gzip: found.size / 2, min: found.size },
            };
        },
        // Ranges in these tests are `^<exact version>`
        async resolve(name, spec) {
            return spec.replace(/^\^/, '');
        },
    };
    const env: Env = { admit, cache, source };
    return { env, measured, store };
}
