/**
 * Convert Markdown/MDX into compact, human-readable text for search and terminal
 * retrieval. Prose inside pedagogical components survives, while module syntax
 * and visual-only drawings do not consume the retrieval budget.
 */
export function plainMdx(body = '', limit = Number.POSITIVE_INFINITY): string {
  const text = body
    .replace(/^[ \t]*import\b[\s\S]*?;[ \t]*$/gm, ' ')
    .replace(/^[ \t]*export\b[\s\S]*?;[ \t]*$/gm, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(svg|style|script|canvas)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}[#>]+\s*/gm, '')
    .replace(/^\s*[-*+|:]\s*$/gm, ' ')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!Number.isFinite(limit) || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}
