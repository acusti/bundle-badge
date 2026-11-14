import { COLORS, formatBytes, renderBadge } from './badge.ts';
import { renderPage } from './page.ts';
import { parsePageRoute, parseRoute } from './route.ts';
import { createRun, sizeOf } from './size.ts';
import type { Env } from './size.ts';
import type { PageTarget } from './route.ts';
import type { SizeResult } from './types.ts';

/** How long to wait for a first-time computation before answering “calculating”. */
const PATIENCE_MS = 3000;

const SVG = 'image/svg+xml; charset=utf-8';

const USAGE = `bundle-badge: minified + gzipped size badges for npm packages

  /minzip/<package>[/<version>]   minified and gzipped, with dependencies
  /min/<package>[/<version>]      minified, with dependencies
  /package/<package>[/<version>]  a page with both sizes and past versions

Examples:
  /minzip/@acusti/dropdown
  /minzip/clsx/2.1.1
`;

const HTML = 'text/html; charset=utf-8';

const badge = (body: string, cacheControl: string) =>
    new Response(body, {
        headers: { 'Cache-Control': cacheControl, 'Content-Type': SVG },
    });

const unavailable = (label: string, value: string, maxAge: number) =>
    badge(renderBadge(label, value, COLORS.slate), `public, max-age=${maxAge}`);

/**
 * Measures a package, answering “pending” if it takes too long. Keeps
 * computing after answering, so a slow first run fills the cache for the
 * next view instead of being thrown away.
 */
async function measureInTime(
    env: Env,
    context: Context,
    name: string,
    version: string,
): Promise<SizeResult | 'pending'> {
    const computation = sizeOf(env, createRun(), name, version).catch((): SizeResult => ({
        ok: false,
        reason: 'unexpected error',
        transient: true,
    }));
    context.waitUntil(computation);
    const timeout = new Promise<'pending'>((resolve) =>
        setTimeout(() => resolve('pending'), PATIENCE_MS),
    );
    return Promise.race([computation, timeout]);
}

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
    const page = parsePageRoute(pathname);
    if (page) return handlePage(request, env, context, page);
    const target = parseRoute(pathname);
    if (!target) return new Response(USAGE, { status: 404 });

    const { format, name, spec } = target;
    // A version-less badge follows the latest release, so a new one shows up
    // within minutes; a pinned one never changes
    const resolved = await env.source.resolve(name, spec);
    if (typeof resolved !== 'string') {
        return unavailable(format, 'unable to compute size', 300);
    }

    const result = await measureInTime(env, context, name, resolved);

    if (result === 'pending') return unavailable(format, 'calculating…', 30);
    if (!result.ok) {
        return result.transient
            ? unavailable(format, 'try again shortly', 30)
            : unavailable(format, 'unable to compute size', 3600);
    }
    const lifetime = spec === 'latest' ? 300 : 86_400;
    return badge(
        renderBadge(format, formatBytes(format === 'min' ? result.min : result.gzip)),
        `public, max-age=${lifetime}`,
    );
}

async function handlePage(
    request: Request,
    env: Env,
    context: Context,
    { name, spec }: PageTarget,
): Promise<Response> {
    const html = (body: string, status: number, maxAge: number) =>
        new Response(body, {
            headers: {
                'Cache-Control': `public, max-age=${maxAge}`,
                'Content-Type': HTML,
            },
            status,
        });
    const [resolved, versions, latest] = await Promise.all([
        env.source.resolve(name, spec),
        env.source.versions(name),
        env.source.resolve(name, 'latest'),
    ]);
    if (typeof resolved !== 'string' || !Array.isArray(versions)) {
        return html(
            '<!doctype html><title>Not found</title><p>No such package or version.',
            404,
            60,
        );
    }
    const result = await measureInTime(env, context, name, resolved);
    const all = new URL(request.url).searchParams.has('all');
    const settled = result !== 'pending' && !(!result.ok && result.transient);
    return html(
        renderPage({
            all,
            latest: typeof latest === 'string' ? latest : undefined,
            name,
            result,
            version: resolved,
            versions,
        }),
        200,
        settled ? (spec === 'latest' ? 300 : 86_400) : 30,
    );
}
