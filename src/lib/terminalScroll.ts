interface WheelBoundary {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  deltaY: number;
  deltaMode?: number;
  lineHeight?: number;
  pageHeight?: number;
}

/** Outward wheel distance only; gestures within terminal history stay native. */
export function terminalWheelHandoff({
  scrollTop, scrollHeight, clientHeight, deltaY, deltaMode = 0, lineHeight = 16, pageHeight = clientHeight,
}: WheelBoundary): number {
  if (![scrollTop, scrollHeight, clientHeight, deltaY].every(Number.isFinite) || clientHeight <= 0) return 0;
  const maximum = Math.max(0, scrollHeight - clientHeight);
  // One pixel accommodates fractional layout, not the looser "latest output" threshold.
  const outward = deltaY < 0 ? scrollTop <= 1 : deltaY > 0 && scrollTop >= maximum - 1;
  if (!outward) return 0;
  const unit = deltaMode === 1 ? lineHeight : deltaMode === 2 ? pageHeight : 1;
  const safeUnit = Number.isFinite(unit) && unit > 0 ? unit : deltaMode === 1 ? 16 : clientHeight;
  return deltaY * safeUnit;
}
