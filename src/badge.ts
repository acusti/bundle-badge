// Mirrors the look of npmx.dev’s `size` badge: two flat halves, a near-black
// label and a purple value, drawn by hand because Workers have no canvas.

const LABEL_COLOR = '#0a0a0a';
export const COLORS = { purple: '#a855f7', slate: '#64748b' } as const;

const HEIGHT = 20;
const FONT_SIZE = 11;
const PADDING = 12;
const MIN_TEXT_WIDTH = 40;

// Widths in px at 11px for sans-serif fallbacks, by class of character. Close
// enough to center the text; the padding absorbs the difference.
function charWidth(char: string): number {
    if ("il.,:;|!'`".includes(char)) return 3.2;
    if (' fjrt()[]-'.includes(char)) return 4;
    if ('mwMW'.includes(char)) return 9.4;
    if (/[A-Z]/.test(char)) return 7.6;
    if (/[0-9]/.test(char)) return 6.7;
    return 6;
}

const textWidth = (text: string) =>
    Math.ceil(Array.from(text).reduce((sum, char) => sum + charWidth(char), 0));

const escapeXml = (text: string) =>
    text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Black or white, whichever reads better on `background` (WCAG contrast). */
export function textColorOn(background: string): '#000000' | '#ffffff' {
    const [red, green, blue] = [1, 3, 5].map((start) => {
        const channel = parseInt(background.slice(start, start + 2), 16) / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
}

/** Formats like npmx: 1024-based units, labelled KB and MB. */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function renderBadge(
    label: string,
    value: string,
    valueColor: string = COLORS.purple,
): string {
    const labelWidth = Math.max(MIN_TEXT_WIDTH, textWidth(label)) + PADDING;
    const valueWidth = Math.max(MIN_TEXT_WIDTH, textWidth(value)) + PADDING;
    const width = labelWidth + valueWidth;
    const title = escapeXml(`${label}: ${value}`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" role="img" aria-label="${title}">
  <title>${title}</title>
  <clipPath id="r">
    <rect width="${width}" height="${HEIGHT}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${HEIGHT}" fill="${LABEL_COLOR}"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${HEIGHT}" fill="${valueColor}"/>
  </g>
  <g text-anchor="middle" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="${FONT_SIZE}">
    <text x="${labelWidth / 2}" y="14" fill="#ffffff">${escapeXml(label)}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14" fill="${textColorOn(valueColor)}">${escapeXml(value)}</text>
  </g>
</svg>
`;
}
