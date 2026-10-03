/** Uniform view fitting: callers apply the returned scale to every axis. */
export function fitHorizontal(
  width: number,
  requestedOrigin: number,
  requestedScale: number,
  extent: number
) {
  const available = Math.max(0, width / 2 - 16);
  const scale = Math.min(requestedScale, available / extent);
  const halfWidth = scale * extent;
  const origin =
    width < 32
      ? width / 2
      : Math.min(Math.max(requestedOrigin, 16 + halfWidth), width - 16 - halfWidth);
  return { origin, scale, halfWidth };
}
