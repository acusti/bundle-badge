import { formatBytes } from './badge.ts';
import type { SizeResult } from './types.ts';

/** How many versions the page lists before offering the rest. */
export const VERSIONS_SHOWN = 30;

const escapeHtml = (text: string) =>
    text.replace(
        /[&<>"']/g,
        (character) =>
            ({
                '"': '&quot;',
                '&': '&amp;',
                "'": '&#39;',
                '<': '&lt;',
                '>': '&gt;',
            })[character] as string,
    );

type PageData = {
    all: boolean;
    latest: string | undefined;
    name: string;
    result: SizeResult | 'pending';
    version: string;
    versions: string[];
};

const STYLE = `
:root{color-scheme:light dark;font-family:system-ui,sans-serif}
body{max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.5}
h1{font-size:1.5rem;margin:0}h1 span{font-weight:400;opacity:.6}
dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1.5rem;margin:1.5rem 0}
dt{opacity:.6}dd{margin:0;font-variant-numeric:tabular-nums}
ul{padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:.25rem .75rem}
a{color:#a855f7}footer{margin-top:3rem;font-size:.875rem;opacity:.7}[aria-current]{font-weight:700;text-decoration:none;color:inherit}
`;

export function renderPage({ all, latest, name, result, version, versions }: PageData) {
    const base = `/package/${name}`;
    const npm = `https://npmx.dev/package/${name}/v/${encodeURIComponent(version)}`;
    const sizes =
        result === 'pending'
            ? '<p>Still calculating. Reload in a few seconds.</p>'
            : result.ok
              ? `<dl><dt>minified</dt><dd>${formatBytes(result.min)}</dd>` +
                `<dt>minified + gzipped</dt><dd>${formatBytes(result.gzip)}</dd></dl>`
              : `<p>Unable to compute size: ${escapeHtml(result.reason)}.</p>`;
    const shown = all ? versions : versions.slice(0, VERSIONS_SHOWN);
    const items = shown
        .map((entry) =>
            entry === version
                ? `<li><a aria-current="page" href="${base}/${entry}">${escapeHtml(entry)}</a></li>`
                : `<li><a href="${base}/${entry}">${escapeHtml(entry)}</a></li>`,
        )
        .join('');
    const more =
        !all && versions.length > shown.length
            ? `<p><a href="${base}/${version}?all=1">Show all ${versions.length} versions</a></p>`
            : '';
    const title = escapeHtml(`${name}@${version}`);
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} bundle size</title><style>${STYLE}</style></head>
<body><h1>${escapeHtml(name)} <span>${escapeHtml(version)}${
        version === latest ? ' (latest)' : ''
    }</span></h1>
${sizes}
<p>Sizes include dependencies. <a href="${npm}">View on npm</a></p>
<h2>Versions</h2><ul>${items}</ul>${more}
<footer><p><a href="https://github.com/acusti/bundle-badge#readme">About bundle-badge</a> (how sizes are measured, and how to add a bundle size badge to your README)</p></footer>
</body></html>
`;
}
