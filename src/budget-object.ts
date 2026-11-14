import { DurableObject } from 'cloudflare:workers';
import { take } from './budget.ts';
import type { Day } from './budget.ts';

/**
 * A single global counter of the measurements (each a download plus a
 * minify) let through per UTC day. It is a Durable Object because the
 * limit has to be exact across every Cloudflare location, which the
 * per-location rate limiting binding can’t promise.
 */
export class MeasurementBudget extends DurableObject {
    async take(limit: number): Promise<boolean> {
        const today = new Date().toISOString().slice(0, 10);
        const { allowed, state } = take(
            await this.ctx.storage.get<Day>('day'),
            today,
            limit,
        );
        if (allowed) await this.ctx.storage.put('day', state);
        return allowed;
    }
}
