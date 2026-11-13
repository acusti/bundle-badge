/** Minified and gzipped byte sizes of some JavaScript. */
export type Size = { gzip: number; min: number };

/**
 * Why a size couldn’t be computed. `transient` failures (a spent budget, a
 * flaky registry) say nothing about the package itself, so they are never
 * cached.
 */
export type Failure = { ok: false; reason: string; transient?: boolean };

export type SizeResult = (Size & { ok: true }) | Failure;

/** One package’s own files, measured, plus the dependencies to add on top. */
export type Measurement =
    | { dependencies: Record<string, string>; ok: true; own: Size }
    | Failure;

export const fail = (reason: string, transient = false): Failure => ({
    ok: false,
    reason,
    ...(transient ? { transient } : {}),
});
