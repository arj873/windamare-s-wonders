// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fillSvg, prepareSvg } from './art';

const SVG =
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
  '<g id="base"/><g id="tier-1"/><g id="tier-2"/><g id="tier-3"/><g id="tier-4"/></svg>';

describe('inline art', () => {
  it('renames ids so one picture can appear many times on a page', () => {
    const out = prepareSvg(SVG);
    expect(out).not.toContain('<?xml');
    expect(out).not.toMatch(/\sid="/);
    expect(out).toContain('data-tier="3"');
    expect(out).toContain('data-id="base"');
  });

  it('fades the tier layers above the completed tiers', () => {
    const el = document.createElement('span');
    fillSvg(el, prepareSvg(SVG), 2);
    const opacity = [...el.querySelectorAll('[data-tier]')].map((g) => g.getAttribute('opacity'));
    expect(opacity).toEqual(['1', '1', '0.22', '0.22']);
  });
});
