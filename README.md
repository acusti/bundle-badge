# bundle-badge

Badges that show how big an npm package is once it’s bundled: minified and
gzipped, with its dependencies, the way a Vite build would ship it. It runs
as a [Cloudflare Worker](https://developers.cloudflare.com/workers/) and
draws the same badge as [npmx.dev](https://npmx.dev)’s, so the two sit
together in a README.

[![minzip](https://bundle-badge.andrew-ab6.workers.dev/minzip/@acusti/dropdown)](https://bundle-badge.andrew-ab6.workers.dev/package/@acusti/dropdown)

```md
[![minzip](https://<your-worker>/minzip/@acusti/dropdown)](https://<your-worker>/package/@acusti/dropdown)
```

The badge links to the package’s page, which shows both sizes, a link to
npm and the other versions, rather than to the image itself.

## Routes

| Route                            | Shows                                                                     |
| -------------------------------- | ------------------------------------------------------------------------- |
| `/minzip/<package>[/<version>]`  | minified and gzipped size, dependencies                                   |
| `/min/<package>[/<version>]`     | minified size, dependencies included                                      |
| `/package/<package>[/<version>]` | an HTML page: both sizes, a link to npm, and the package’s other versions |

`<package>` can be scoped (`@scope/name`). `<version>` can be an exact
version, a range, or a dist-tag, and defaults to `latest`. When a size
can’t be worked out, the badge says `unable to compute size`.

The page measures only the version it shows. Other versions are links, so
browsing past releases costs nothing until one is opened.

## How a size is worked out

For `name@version`, the Worker:

1. downloads the package tarball from the npm registry;
2. finds the entry file a browser build would use (`exports` conditions
   `browser`, `import`, `module`, `production`, `default`, in the order the
   package lists them, then `browser`, `module`, `main`);
3. follows the entry’s static relative imports to collect the package’s own
   files, and minifies each with
   [`oxc-minify`](https://oxc.rs/docs/guide/usage/minifier), the minifier
   Vite’s Rolldown uses, running as WebAssembly;
4. gzips the result;
5. adds the size of each entry in `dependencies`, worked out by calling the
   same function, so dependencies read and write the same cache.

Published versions are immutable, so a result is stored in Workers KV for
good, keyed by algorithm version and `name@version`. A first view of a
package costs a few hundred milliseconds of CPU; every view after that is a
KV read. Dependency ranges are resolved when a package is first measured
and stay as they resolved then. If the first computation takes more than a
few seconds, the badge says `calculating…` while the Worker finishes it in
the background.

### Limits

- It measures a package’s entry file and what it imports, with no
  tree-shaking, so a package with many entry points reads as its main one.
- A dependency two packages share is counted once for each of them.
- Dependency cycles, packages whose entry isn’t JavaScript, and packages
  over 5 MB (25 MB unpacked) report `unable to compute size`.
- One request measures at most 40 uncached packages. A larger tree finishes
  over a few views, since each package it does measure is cached.

## Cost limits

The only expensive step is measuring a package (download, minify, gzip),
and it only happens the first time a version is requested. Two limits cap
it:

- **Per caller:** 30 measurements per minute per client IP, per Cloudflare
  location (the Workers rate limiting binding, which is approximate).
- **Per day, for everyone:** `DAILY_MEASUREMENTS` (5,000 by default). This
  count is exact, since it lives in a Durable Object, and it resets at
  midnight UTC. At roughly 50 ms of CPU each, a full day is about 250 CPU
  seconds, so a month stays well inside the Workers Paid plan’s included
  CPU time.

Past either limit, badges for packages that are already cached keep working
and the rest say `try again shortly`; each package that did get measured
stays cached, so a big tree finishes over a few tries.

Cached views are not limited, because by then the cost is the request
itself, and Cloudflare bills every invocation of a Worker, including ones
that return a 429. To cap that too, set a
[Workers spending limit](https://developers.cloudflare.com/workers/platform/pricing/#control-usage-costs)
on the account, or put the Worker on a custom domain and add a WAF rate
limiting rule, which blocks requests before they reach it.

## Running your own

Minifying takes more CPU than the Workers Free plan’s 10 ms per request, so
this needs the
[Workers Paid plan](https://developers.cloudflare.com/workers/platform/pricing/)
($5/month).

```bash
bun install
bun run deploy
```

Deploying creates the `SIZES` KV namespace (the cache) for you. To try it
locally, run `bun run dev`. Change `DAILY_MEASUREMENTS` in `wrangler.jsonc`
to set how many packages may be measured per day.

## Development

```bash
bun run test          # unit tests
bun run tsc           # type-check
bun run lint
bun run format:check
```

Bump `ALGORITHM` in `src/size.ts` whenever the way sizes are computed
changes; the old results are then ignored rather than served stale.
