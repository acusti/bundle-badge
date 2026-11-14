/** How many measurements have been let through on one UTC day. */
export type Day = { day: string; used: number };

/**
 * One more measurement, if today’s allowance isn’t spent. Pure so it can be
 * tested; `MeasurementBudget` keeps the state.
 */
export function take(
    state: Day | undefined,
    today: string,
    limit: number,
): { allowed: boolean; state: Day } {
    const current = state?.day === today ? state : { day: today, used: 0 };
    if (current.used >= limit) return { allowed: false, state: current };
    return { allowed: true, state: { day: today, used: current.used + 1 } };
}
