import { describe, expect, it } from 'vitest';
import { createRun, sizeFor, sizeOf } from '../src/size.ts';
import { fakeEnv, key } from './helpers.ts';

describe('sizeOf', () => {
    it('adds dependencies, and caches each package under its own key', async () => {
        const { env, store } = fakeEnv({
            'app@1.0.0': { dependencies: { lib: '^2.0.0' }, size: 100 },
            'lib@2.0.0': { dependencies: { leaf: '^3.0.0' }, size: 20 },
            'leaf@3.0.0': { size: 4 },
        });
        expect(await sizeFor(env, 'app', '1.0.0')).toEqual({
            gzip: 62,
            min: 124,
            ok: true,
        });
        expect(store.get(key('app@1.0.0'))).toMatchObject({ min: 124 });
        expect(store.get(key('lib@2.0.0'))).toMatchObject({ min: 24 });
        expect(store.get(key('leaf@3.0.0'))).toMatchObject({ min: 4 });
    });

    it('answers from the cache without measuring again', async () => {
        const { env, measured } = fakeEnv({ 'a@1.0.0': { size: 10 } });
        await sizeFor(env, 'a', '1.0.0');
        await sizeFor(env, 'a', '1.0.0');
        expect(measured).toEqual(['a@1.0.0']);
    });

    it('reuses a dependency another package already cached', async () => {
        const { env, measured } = fakeEnv({
            'a@1.0.0': { dependencies: { shared: '^1.0.0' }, size: 10 },
            'b@1.0.0': { dependencies: { shared: '^1.0.0' }, size: 10 },
            'shared@1.0.0': { size: 5 },
        });
        await sizeFor(env, 'a', '1.0.0');
        expect(await sizeFor(env, 'b', '1.0.0')).toMatchObject({ min: 15 });
        expect(measured).toEqual(['a@1.0.0', 'shared@1.0.0', 'b@1.0.0']);
    });

    it('measures a package shared within one tree once, and counts it for each dependent', async () => {
        const { env, measured } = fakeEnv({
            'app@1.0.0': { dependencies: { a: '^1.0.0', b: '^1.0.0' }, size: 10 },
            'a@1.0.0': { dependencies: { shared: '^1.0.0' }, size: 10 },
            'b@1.0.0': { dependencies: { shared: '^1.0.0' }, size: 10 },
            'shared@1.0.0': { size: 5 },
        });
        expect(await sizeFor(env, 'app', '1.0.0')).toMatchObject({ min: 40 });
        expect(measured.filter((id) => id === 'shared@1.0.0')).toHaveLength(1);
    });

    it('reports a dependency cycle as a failure instead of recursing forever', async () => {
        const { env } = fakeEnv({
            'a@1.0.0': { dependencies: { b: '^1.0.0' }, size: 10 },
            'b@1.0.0': { dependencies: { a: '^1.0.0' }, size: 20 },
        });
        expect(await sizeFor(env, 'a', '1.0.0')).toMatchObject({
            ok: false,
            reason: 'b: a: dependency cycle',
        });
    });

    it('fails, and caches the failure, when a dependency can’t be measured', async () => {
        const { env, store } = fakeEnv({
            'a@1.0.0': { dependencies: { gone: '^1.0.0' }, size: 10 },
        });
        expect(await sizeFor(env, 'a', '1.0.0')).toEqual({
            ok: false,
            reason: 'gone: not on npm',
        });
        expect(store.get(key('a@1.0.0'))).toMatchObject({ ok: false });
    });

    it('gives up on huge trees without caching the shortfall', async () => {
        const { env, store } = fakeEnv({
            'a@1.0.0': { dependencies: { b: '^1.0.0', c: '^1.0.0' }, size: 10 },
            'b@1.0.0': { size: 1 },
            'c@1.0.0': { size: 1 },
        });
        const result = await sizeOf(env, createRun(2), 'a', '1.0.0');
        expect(result).toMatchObject({ ok: false, transient: true });
        expect(store.has(key('a@1.0.0'))).toBe(false);
        // what did get measured is kept, so the next try gets further
        expect(store.has(key('b@1.0.0')) || store.has(key('c@1.0.0'))).toBe(true);
        expect(await sizeFor(env, 'a', '1.0.0')).toMatchObject({ min: 12, ok: true });
    });

    it('fails without caching when admission is refused, and finishes on a later try', async () => {
        let admissions = 1;
        const { env, store } = fakeEnv(
            {
                'a@1.0.0': { dependencies: { b: '^1.0.0' }, size: 10 },
                'b@1.0.0': { size: 5 },
            },
            async () => admissions-- > 0,
        );
        const result = await sizeFor(env, 'a', '1.0.0');
        expect(result).toMatchObject({ ok: false, transient: true });
        expect(store.size).toBe(0);
        // with more allowance, the next attempt finishes the job
        admissions = 5;
        expect(await sizeFor(env, 'a', '1.0.0')).toMatchObject({ min: 15, ok: true });
    });

    it('never asks admission for what is already cached', async () => {
        let asked = 0;
        const { env } = fakeEnv({ 'a@1.0.0': { size: 10 } }, async () => {
            asked++;
            return true;
        });
        await sizeFor(env, 'a', '1.0.0');
        await sizeFor(env, 'a', '1.0.0');
        expect(asked).toBe(1);
    });
});
