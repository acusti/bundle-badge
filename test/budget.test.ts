import { describe, expect, it } from 'vitest';
import { take } from '../src/budget.ts';

describe('take', () => {
    it('lets through up to the limit each day, then refuses', () => {
        let state = take(undefined, '2026-11-13', 2).state;
        expect(state).toEqual({ day: '2026-11-13', used: 1 });
        state = take(state, '2026-11-13', 2).state;
        expect(take(state, '2026-11-13', 2)).toEqual({
            allowed: false,
            state: { day: '2026-11-13', used: 2 },
        });
    });

    it('starts over on a new day', () => {
        const spent = { day: '2026-11-13', used: 2 };
        expect(take(spent, '2026-11-14', 2)).toEqual({
            allowed: true,
            state: { day: '2026-11-14', used: 1 },
        });
    });
});
