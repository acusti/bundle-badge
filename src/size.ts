import { fail } from './types.ts';
import type { Failure, Measurement, SizeResult } from './types.ts';

/** Bump when the way sizes are computed changes; it namespaces the cache. */
export const ALGORITHM = 'v1';

/** How many packages one request may download and minify before giving up. */
export const MAX_MEASUREMENTS = 40;

export type Cache = {
    get(key: string): Promise<SizeResult | null>;
    put(key: string, result: SizeResult): Promise<void>;
};

/** The parts of sizing that touch the network or WebAssembly. */
export type Source = {
    /** Downloads and measures one published version’s own code. */
    measure(name: string, version: string): Promise<Measurement>;
    /** Turns a dist-tag or semver range into the version it currently means. */
    resolve(name: string, spec: string): Promise<Failure | string>;
};

export type Env = {
    /**
     * Asks leave to download and minify one package, the expensive step. Says
     * no when the caller or the whole service has done its share for now.
     */
    admit(): Promise<boolean>;
    cache: Cache;
    source: Source;
};

/** State shared by every `sizeOf` call that one request makes. */
export type Run = {
    measuring: Map<string, Promise<Measurement>>;
    remaining: number;
};

export const createRun = (remaining = MAX_MEASUREMENTS): Run => ({
    measuring: new Map(),
    remaining,
});

function measureOnce(
    env: Env,
    run: Run,
    id: string,
    name: string,
    version: string,
): Promise<Measurement> {
    let measurement = run.measuring.get(id);
    if (!measurement) {
        if (run.remaining <= 0) {
            return Promise.resolve(
                fail('too many packages to measure at once, retry shortly', true),
            );
        }
        run.remaining--;
        measurement = env
            .admit()
            .then((admitted) =>
                admitted
                    ? env.source.measure(name, version)
                    : fail('too busy to measure new packages, retry later', true),
            );
        run.measuring.set(id, measurement);
    }
    return measurement;
}

/**
 * The minified and gzipped size of `name@version` and everything it depends on.
 *
 * Dependencies are sized by calling this same function, so they read and
 * write the same cache as the package asked about: the first badge for a
 * package fills in the cache for its whole tree. Published versions never
 * change, so a result is kept for good, with the dependency ranges frozen as
 * they resolved the first time.
 *
 * A package shared by two dependencies is counted twice, since sizing each
 * subtree on its own is what makes the results cacheable. For the same reason
 * a dependency cycle can’t be added up, and every package in one fails.
 */
export async function sizeOf(
    env: Env,
    run: Run,
    name: string,
    version: string,
    ancestors: ReadonlySet<string> = new Set(),
): Promise<SizeResult> {
    const id = `${name}@${version}`;
    if (ancestors.has(id)) return fail('dependency cycle');

    const key = `${ALGORITHM}:${id}`;
    const cached = await env.cache.get(key);
    if (cached) return cached;

    const result = await compute(env, run, id, name, version, ancestors);
    // A transient failure says nothing about the package itself
    if (result.ok || !result.transient) await env.cache.put(key, result);
    return result;
}

async function compute(
    env: Env,
    run: Run,
    id: string,
    name: string,
    version: string,
    ancestors: ReadonlySet<string>,
): Promise<SizeResult> {
    const own = await measureOnce(env, run, id, name, version);
    if (!own.ok) return own;

    const branch = new Set(ancestors).add(id);
    const dependencies = await Promise.all(
        Object.entries(own.dependencies).map(async ([dependency, spec]) => {
            const resolved = await env.source.resolve(dependency, spec);
            const result =
                typeof resolved === 'string'
                    ? await sizeOf(env, run, dependency, resolved, branch)
                    : resolved;
            return { dependency, result };
        }),
    );

    let { gzip, min } = own.own;
    for (const { dependency, result } of dependencies) {
        if (!result.ok) return fail(`${dependency}: ${result.reason}`, result.transient);
        gzip += result.gzip;
        min += result.min;
    }
    return { gzip, min, ok: true };
}

/** `sizeOf` for a caller with nothing in progress yet. */
export const sizeFor = (env: Env, name: string, version: string) =>
    sizeOf(env, createRun(), name, version);
