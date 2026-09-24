import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';

const source = readFileSync(new URL('./SponsorsManager.jsx', import.meta.url), 'utf8');
const css = postcss.parse(readFileSync(new URL('./SponsorsManager.module.css', import.meta.url), 'utf8'));

function mediaRules(pattern) {
  const matches = [];
  css.walkAtRules('media', (rule) => {
    if (pattern.test(rule.params)) matches.push(rule);
  });
  return matches;
}

function declarations(nodes) {
  const result = [];
  for (const node of nodes) node.walkDecls((declaration) => result.push(declaration));
  return result;
}

function hasDeclaration(nodes, property, value) {
  return declarations(nodes).some((declaration) => property.test(declaration.prop) && value.test(declaration.value));
}

function isWithin(node, atRuleName) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && parent.name === atRuleName) return true;
  }
  return false;
}

describe('sponsor glass experiment style boundaries', () => {
  it('scopes all selectors to local module classes and imports the module only into sponsor management', () => {
    expect(source).toMatch(/import\s+styles\s+from\s+['"]\.\/SponsorsManager\.module\.css['"]/);
    css.walkRules((rule) => {
      if (isWithin(rule, 'keyframes')) return;
      for (const selector of rule.selectors) {
        expect(selector, `Unscoped selector: ${selector}`).toMatch(/^\.[a-zA-Z_][\w-]*/);
        expect(selector).not.toContain(':global');
      }
    });
    for (const path of ['../sponsors/SponsorCard.jsx', '../sponsors/SponsorDirectory.jsx', '../../pages/Sponsors.jsx', '../../index.css']) {
      expect(readFileSync(new URL(path, import.meta.url), 'utf8')).not.toContain('SponsorsManager.module.css');
    }
  });

  it('keeps decorative surfaces, shadows, borders, text and focus achromatic without boosting saturation', () => {
    let checkedColors = 0;
    css.walkDecls((declaration) => {
      const saturation = [...declaration.value.matchAll(/saturate\(\s*([\d.]+)(%)?\s*\)/gi)];
      for (const [, amount, percent] of saturation) expect(Number(amount)).toBeLessThanOrEqual(percent ? 100 : 1);
      if (!/^(?:background|border|outline|box-shadow|text-shadow|color|--glass-)/.test(declaration.prop)) return;
      // Error text remains semantic; it is not part of the decorative palette.
      if (declaration.prop === 'color' && /\[role=['"]alert['"]\]/.test(declaration.parent.selector || '')) return;
      expect(declaration.value).not.toMatch(/\b(?:hsla?|hwb|(?:ok)?lab|(?:ok)?lch|color(?:-mix)?)\(/i);
      const colors = declaration.value.match(/#[\da-f]{3,8}\b|rgba?\([^)]*\)/gi) || [];
      for (const color of colors) {
        const channels = color.startsWith('#')
          ? (color.length <= 5 ? [...color.slice(1, 4)].map((digit) => parseInt(digit + digit, 16)) : [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16)))
          : color.slice(color.indexOf('(') + 1).split(/[,\s/]+/).filter(Boolean).slice(0, 3).map(Number);
        expect(channels.every(Number.isFinite)).toBe(true);
        expect(new Set(channels).size, `${declaration.parent.selector}: ${declaration.prop}: ${color}`).toBe(1);
        checkedColors += 1;
      }
    });
    expect(checkedColors).toBeGreaterThan(0);
  });

  it('provides a solid background fallback before enabling backdrop effects', () => {
    const unconditional = [];
    const blur = [];
    css.walkDecls((declaration) => {
      if (!isWithin(declaration, 'supports') && !isWithin(declaration, 'media')) unconditional.push(declaration);
      if (/^(?:-webkit-)?backdrop-filter$/.test(declaration.prop) && /blur\(/.test(declaration.value)) blur.push(declaration);
    });
    expect(unconditional.some((declaration) => /^background(?:-color)?$/.test(declaration.prop) && /^(?:#[\da-f]{3}|#[\da-f]{6}|white)$/i.test(declaration.value))).toBe(true);
    expect(blur.length).toBeGreaterThan(0);
    for (const declaration of blur) expect(isWithin(declaration, 'supports'), 'Blur must be progressively enabled').toBe(true);
  });

  it('disables each motion effect introduced by the experiment for reduced motion', () => {
    const reduced = mediaRules(/prefers-reduced-motion\s*:\s*reduce/);
    expect(reduced.length).toBeGreaterThan(0);
    const introduced = new Set();
    css.walkDecls((declaration) => {
      if (/^(?:transition|animation)$/.test(declaration.prop) && declaration.value !== 'none') introduced.add(declaration.prop);
    });
    expect(introduced.size).toBeGreaterThan(0);
    for (const property of introduced) expect(hasDeclaration(reduced, new RegExp(`^${property}$`), /^none$/)).toBe(true);
  });

  it('disables backdrop effects and supplies opaque surfaces for reduced transparency', () => {
    const reduced = mediaRules(/prefers-reduced-transparency\s*:\s*reduce/);
    expect(reduced.length).toBeGreaterThan(0);
    expect(hasDeclaration(reduced, /^(?:-webkit-)?backdrop-filter$/, /^none$/)).toBe(true);
    expect(hasDeclaration(reduced, /^background(?:-color)?$/, /^(?:#[\da-f]{3}|#[\da-f]{6}|white)$/i)).toBe(true);
  });

  it('uses system colors and visible focus indicators in forced-color mode', () => {
    const forced = mediaRules(/forced-colors\s*:\s*active/);
    expect(forced.length).toBeGreaterThan(0);
    expect(hasDeclaration(forced, /^background(?:-color)?$/, /\bCanvas\b/)).toBe(true);
    expect(hasDeclaration(forced, /^color$/, /\b(?:CanvasText|ButtonText)\b/)).toBe(true);
    expect(hasDeclaration(forced, /^(?:-webkit-)?backdrop-filter$/, /^none$/)).toBe(true);
    const focusRules = [];
    css.walkRules((rule) => {
      if (rule.selector.includes(':focus-visible')) focusRules.push(rule);
    });
    expect(focusRules.length).toBeGreaterThan(0);
    expect(declarations(focusRules).some((declaration) => declaration.prop === 'outline' && !/^(?:none|0)(?:\s|$)/.test(declaration.value))).toBe(true);
  });
});
