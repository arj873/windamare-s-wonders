/**
 * A tiny markdown-to-DOM renderer for docs/HOWTOPLAY.md: headings, paragraphs, bullet and
 * numbered lists, one table shape, **bold** and `code`. Text always goes through text nodes.
 */
import { h, type Child } from '../dom';

function inline(text: string): Child[] {
  const out: Child[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? h('strong', {}, m[1]) : h('code', {}, m[2]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderMarkdown(md: string): HTMLElement[] {
  const lines = md.split('\n');
  const out: HTMLElement[] = [];
  let i = 0;
  const startsBlock = (l: string): boolean => /^(#{1,3} |- |\d+\. |\|)/.test(l) || l.trim() === '';
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i++;
    } else if (/^#{1,3} /.test(line)) {
      const level = (/^#+/.exec(line)?.[0] ?? '#').length;
      out.push(
        h(level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5', {}, ...inline(line.replace(/^#+ /, ''))),
      );
      i++;
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d/.test(line);
      const items: HTMLElement[] = [];
      while (i < lines.length && /^(- |\d+\. |\s+\S)/.test(lines[i] ?? '')) {
        const l = lines[i] ?? '';
        if (/^\s/.test(l)) {
          const prev = items[items.length - 1];
          if (prev)
            prev.append(
              ' ',
              ...inline(l.trim()).filter(
                (c): c is string | Node => typeof c === 'string' || c instanceof Node,
              ),
            );
        } else {
          items.push(h('li', {}, ...inline(l.replace(/^(- |\d+\. )/, ''))));
        }
        i++;
      }
      out.push(h(ordered ? 'ol' : 'ul', {}, ...items));
    } else if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('|')) {
        const cells = (lines[i] ?? '')
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, ...(head ?? []).map((c) => h('th', {}, ...inline(c))))),
          h(
            'tbody',
            {},
            ...body.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, ...inline(c))))),
          ),
        ),
      );
    } else {
      const para: string[] = [];
      while (i < lines.length && !startsBlock(lines[i] ?? '')) para.push((lines[i++] ?? '').trim());
      out.push(h('p', {}, ...inline(para.join(' '))));
    }
  }
  return out;
}
