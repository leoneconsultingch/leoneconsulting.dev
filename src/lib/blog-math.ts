import katex from 'katex';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

/** Render only explicit math delimiters; all surrounding content remains plain text. */
export function renderMathText(text: string): string {
  const opening = /\\\(|\\\[|\$\$/g;
  let cursor = 0;
  let html = '';
  for (let match = opening.exec(text); match; match = opening.exec(text)) {
    const start = match.index;
    const delimiter = match[0];
    const closing = delimiter === '\\(' ? '\\)' : delimiter === '\\[' ? '\\]' : '$$';
    const end = text.indexOf(closing, start + delimiter.length);
    if (end === -1) throw new Error(`Blog math: unclosed ${delimiter} delimiter`);
    html += escapeHtml(text.slice(cursor, start));
    html += katex.renderToString(text.slice(start + delimiter.length, end), {
      displayMode: delimiter !== '\\(',
      output: 'htmlAndMathml',
      throwOnError: true,
      trust: false,
      maxSize: 20,
      maxExpand: 1000,
      macros: {},
    });
    cursor = end + closing.length;
    opening.lastIndex = cursor;
  }
  return html + escapeHtml(text.slice(cursor));
}
