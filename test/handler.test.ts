import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/handler.ts';
import { fakeEnv } from './helpers.ts';

const context = {
    waitUntil() {
        // the tests await results directly
    },
};
const get = (env: ReturnType<typeof fakeEnv>['env'], path: string) =>
    handleRequest(new Request(`https://badge.test${path}`), env, context);

describe('handleRequest', () => {
    it('serves a size badge, cached for a day when the version is pinned', async () => {
        const { env } = fakeEnv({ 'a@1.0.0': { size: 2048 } });
        const response = await get(env, '/min/a/1.0.0');
        expect(response.headers.get('content-type')).toContain('image/svg+xml');
        expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
        expect(await response.text()).toContain('min: 2.00 KB');
    });

    it('shows the gzipped size for minzip', async () => {
        const { env } = fakeEnv({ 'a@1.0.0': { size: 2048 } });
        expect(await (await get(env, '/minzip/a/1.0.0')).text()).toContain(
            'minzip: 1.00 KB',
        );
    });

    it('re-checks the latest version every few minutes', async () => {
        const { env } = fakeEnv({ 'a@latest': { size: 10 } });
        const response = await get(env, '/minzip/a');
        expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    });

    it('answers a failure with a badge, not an error', async () => {
        const { env } = fakeEnv({});
        const response = await get(env, '/minzip/missing/1.0.0');
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('unable to compute size');
    });

    it('explains itself at / and 404s unknown routes', async () => {
        const { env } = fakeEnv({});
        expect((await get(env, '/')).status).toBe(200);
        expect((await get(env, '/nope')).status).toBe(404);
    });
});
