import { COLORS, formatBytes, renderBadge } from './badge.ts';
import { parseRoute } from './route.ts';
import { createRun, sizeOf } from './size.ts';
import type { Env } from './size.ts';
import type { SizeResult } from './types.ts';

/** How long to wait for a first-time computation before answering “calculating”. */
const PATIENCE_MS = 3000;

const SVG = 'image/svg+xml; charset=utf-8';

const USAGE = `bundle-badge: minified + gzipped size badges for npm packages

  /minzip/<package>[/<version>]   minified and gzipped, with dependencies
  /min/<package>[/<version>]      minified, with dependencies

Examples:
  /minzip/@acusti/dropdown
  /minzip/clsx/2.1.1
`;

const badge = (body: string, cacheControl: string) =>
    new Response(body, {
        headers: { 'Cache-Control': cacheControl, 'Content-Type': SVG },
    });

const unavailable = (label: string, value: string, maxAge: number) =>
    badge(renderBadge(label, value, COLORS.slate), `public, max-age=${maxAge}`);

export type Context = { waitUntil(promise: Promise<unknown>): void };

export async function handleRequest(
    request: Request,
    env: Env,
    context: Context,
): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/') return new Response(USAGE);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405 });
    }
    const target = parseRoute(pathname);
    if (!target) return new Response(USAGE, { status: 404 });

    const { format, name, spec } = target;
    // A version-less badge follows the latest release, so a new one shows up
    // within minutes; a pinned one never changes
    const resolved = await env.source.resolve(name, spec);
    if (typeof resolved !== 'string') {
        return unavailable(format, 'unable to compute size', 300);
    }

    // Keep computing after answering, so a slow first run fills the cache
    // for the next view instead of being thrown away
    const computation = sizeOf(env, createRun(), name, resolved).catch(
        (): SizeResult => ({ ok: false, reason: 'unexpected error', transient: true }),
    );
    context.waitUntil(computation);
    const timeout = new Promise<'pending'>((resolve) =>
        setTimeout(() => resolve('pending'), PATIENCE_MS),
    );
    const result = await Promise.race([computation, timeout]);

    if (result === 'pending') return unavailable(format, 'calculating…', 30);
    if (!result.ok) {
        return unavailable(
            format,
            'unable to compute size',
            result.transient ? 30 : 3600,
        );
    }
    const lifetime = spec === 'latest' ? 300 : 86_400;
    return badge(
        renderBadge(format, formatBytes(format === 'min' ? result.min : result.gzip)),
        `public, max-age=${lifetime}`,
    );
}
