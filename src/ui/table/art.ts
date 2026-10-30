/**
 * Inline SVG art (ww-art's files under public/art), so CSS and code can reach inside: a Great
 * Work dims its `tier-N` layers until those tiers are done (ART.md, A6). Files are fetched once
 * and cached as text; ids are renamed to `data-*` so the same picture can appear many times on
 * one page. Our own static assets only: never pass user input here.
 */

const cache = new Map<string, string | null>();
const waiting = new Map<string, (() => void)[]>();

/** `id="tier-2"` → `data-tier="2"`; any other id → `data-id` (ids must be unique per page). */
export function prepareSvg(text: string): string {
  return text
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/\sid="tier-(\d+)"/g, ' data-tier="$1"')
    .replace(/\sid="([^"]*)"/g, ' data-id="$1"');
}

/** The cached SVG text, or null; starts loading it and calls `onReady` once it arrives. */
export function svgText(url: string, onReady: () => void): string | null {
  if (cache.has(url)) return cache.get(url) ?? null;
  const queue = waiting.get(url);
  if (queue) {
    queue.push(onReady);
    return null;
  }
  waiting.set(url, [onReady]);
  const done = (text: string | null) => {
    cache.set(url, text);
    const cbs = waiting.get(url) ?? [];
    waiting.delete(url);
    if (text) for (const cb of cbs) cb();
  };
  try {
    fetch(url)
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => done(t && t.includes('<svg') ? prepareSvg(t) : null))
      .catch(() => done(null));
  } catch {
    done(null);
  }
  return null;
}

/** Put `text` into `el` and fade the tier layers above `tiersDone` (none when undefined). */
export function fillSvg(el: HTMLElement, text: string, tiersDone?: number): void {
  el.innerHTML = text;
  if (tiersDone === undefined) return;
  for (const g of el.querySelectorAll<SVGElement>('[data-tier]')) {
    const tier = Number(g.getAttribute('data-tier'));
    g.setAttribute('opacity', tier > tiersDone ? '0.22' : '1');
  }
}

/** For tests: forget everything loaded. */
export function clearSvgCache(): void {
  cache.clear();
  waiting.clear();
}
