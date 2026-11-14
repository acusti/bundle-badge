import { describe, expect, it } from 'vitest';
import { COLORS, formatBytes, renderBadge, textColorOn } from '../src/badge.ts';

describe('formatBytes', () => {
    it('matches npmx’s 1024-based KB with two decimals', () => {
        expect(formatBytes(43663)).toBe('42.64 KB');
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MB');
    });
});

describe('textColorOn', () => {
    it('picks the same text colors as npmx’s badges', () => {
        expect(textColorOn(COLORS.purple)).toBe('#000000');
        expect(textColorOn('#3b82f6')).toBe('#000000');
        expect(textColorOn('#0a0a0a')).toBe('#ffffff');
        expect(textColorOn(COLORS.slate)).toBe('#ffffff');
    });
});

describe('renderBadge', () => {
    it('draws the npmx layout with its label and size colors', () => {
        const svg = renderBadge('minzip', '12.13 KB');
        expect(svg).toContain('aria-label="minzip: 12.13 KB"');
        expect(svg).toContain('fill="#0a0a0a"');
        expect(svg).toContain('fill="#a855f7"');
        expect(svg).toContain('height="20"');
        expect(svg).toContain('rx="3"');
    });

    it('sizes the halves to the text and keeps the label at least 52px wide', () => {
        const short = renderBadge('v', '1');
        expect(short).toContain('width="104"');
        expect(renderBadge('minzip', 'a much longer value than that')).not.toContain(
            'width="104"',
        );
    });

    it('escapes markup in text', () => {
        expect(renderBadge('a<b', '"&"')).not.toMatch(/a<b|"&"/);
    });
});

describe('renderBadge text', () => {
    it('can’t be selected or hit, so a link around the badge works everywhere', () => {
        const svg = renderBadge('minzip', '1 KB');
        expect(svg).toContain('pointer-events:none');
        expect(svg).toContain('user-select:none');
    });
});
