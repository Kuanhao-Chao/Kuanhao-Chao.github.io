/** Plain-text previews never leave hidden, keyboard-focusable Markdown links. */
export function newsPreview(body: string, limit = 170): string {
  const paragraph = body.trim().split(/\n\s*\n/)[0] ?? '';
  const text = paragraph
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  const prefix = characters.slice(0, Math.max(1, limit - 1)).join('');
  const boundary = prefix.lastIndexOf(' ');
  return `${boundary > prefix.length / 2 ? prefix.slice(0, boundary) : prefix}…`;
}

/** SVG widths are intrinsic viewBox units; choose a scale that keeps labels readable. */
export function readableFigureWidth(width: number, smallestLabel = 12): number {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 640;
  const label = Number.isFinite(smallestLabel) && smallestLabel > 0 ? smallestLabel : 12;
  return Math.ceil(safeWidth * Math.min(3, Math.max(1, 13 / label)));
}

export function figureZoom(scale: number): number {
  return Math.min(3, Math.max(0.1, Number.isFinite(scale) ? scale : 1));
}

export function fitFigureZoom(width: number, height: number, availableWidth: number, availableHeight: number): number {
  return figureZoom(Math.min(availableWidth / width, availableHeight / height));
}
