import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';

const css = postcss.parse(readFileSync(new URL('./EventModal.module.css', import.meta.url), 'utf8'));
function rules(selector, parentType, params) {
  const declarations = {};
  css.walkRules(selector, (rule) => {
    if (rule.parent.type !== parentType || (params && rule.parent.params !== params)) return;
    rule.walkDecls((decl) => { declarations[decl.prop] = decl.value; });
  });
  return declarations;
}

describe('event dialog viewport layout contract', () => {
  it('bounds the dialog and its mobile scroller with a Safari-compatible viewport fallback', () => {
    expect(rules('.backdrop', 'root')['--dialog-height']).toBe('calc(100vh - var(--dialog-gutter))');
    expect(rules('.backdrop', 'atrule', '(height: 100dvh)')['--dialog-height']).toBe('calc(100dvh - var(--dialog-gutter))');
    expect(rules('.dialog', 'root')['max-height']).toBe('var(--dialog-height)');
    expect(rules('.content', 'root')).toMatchObject({ 'max-height': 'var(--dialog-height)', 'overflow-y': 'auto' });
    expect(rules('.details', 'root')['overflow-y']).toBeUndefined();
  });

  it('gives the desktop grid a definite viewport-bounded height and a shrinkable row', () => {
    expect(rules('.withFlyer', 'atrule', '(min-width: 768px)')).toMatchObject({
      height: 'min(48rem, var(--dialog-height))',
      'grid-template-rows': 'minmax(0, 1fr)',
      'grid-template-columns': 'minmax(0, 1.15fr) minmax(0, .85fr)',
      overflow: 'hidden',
    });
    expect(rules('.withFlyer .details', 'atrule', '(min-width: 768px)')).toMatchObject({
      'min-height': '0', 'overflow-y': 'auto',
    });
  });

  it('fits the whole flyer inside its padded column without cropping', () => {
    expect(rules('.artwork', 'root')).toMatchObject({ 'min-height': '0', 'min-width': '0', padding: '1rem' });
    expect(rules('.flyer', 'root')).toMatchObject({ width: '100%', 'object-fit': 'contain', 'max-height': '45vh' });
    expect(rules('.flyer', 'atrule', '(min-width: 768px)')).toMatchObject({ height: '100%', 'max-height': '100%' });
  });
});
