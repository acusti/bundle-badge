import { describe, expect, it } from 'vitest';
import { parseRoute } from '../src/route.ts';

describe('parseRoute', () => {
    it('reads unscoped and scoped names, with and without a version', () => {
        expect(parseRoute('/minzip/clsx')).toEqual({
            format: 'minzip',
            name: 'clsx',
            spec: 'latest',
        });
        expect(parseRoute('/min/clsx/2.1.1')).toEqual({
            format: 'min',
            name: 'clsx',
            spec: '2.1.1',
        });
        expect(parseRoute('/minzip/@acusti/dropdown')).toEqual({
            format: 'minzip',
            name: '@acusti/dropdown',
            spec: 'latest',
        });
        expect(parseRoute('/minzip/@acusti/dropdown/1.4.0.svg')).toEqual({
            format: 'minzip',
            name: '@acusti/dropdown',
            spec: '1.4.0',
        });
    });

    it('accepts an encoded scope separator', () => {
        expect(parseRoute('/minzip/@acusti%2Fdropdown')?.name).toBe('@acusti/dropdown');
    });

    it('rejects unknown formats, bad names, and extra segments', () => {
        expect(parseRoute('/size/clsx')).toBeUndefined();
        expect(parseRoute('/minzip')).toBeUndefined();
        expect(parseRoute('/minzip/Not Valid')).toBeUndefined();
        expect(parseRoute('/minzip/../etc')).toBeUndefined();
        expect(parseRoute('/minzip/clsx/1.0.0/extra')).toBeUndefined();
        expect(parseRoute('/minzip/%E0%A4%A')).toBeUndefined();
    });
});

describe('parsePageRoute', () => {
    it('reads scoped names and versions', () => {
        expect(parsePageRoute('/package/@a/b/1.0.0')).toEqual({ name: '@a/b', spec: '1.0.0' });
        expect(parsePageRoute('/package/b')).toEqual({ name: 'b', spec: 'latest' });
    });

    it('ignores other paths', () => {
        expect(parsePageRoute('/minzip/b')).toBeUndefined();
    });
});
