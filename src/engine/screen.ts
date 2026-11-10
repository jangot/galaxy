/**
 * Canvas at native logical resolution, scaled up by the largest integer factor
 * that fits the window (crisp pixels, no blur).
 */
export function setupScreen(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available');
  ctx.imageSmoothingEnabled = false;

  const resize = (): void => {
    const scale = Math.max(
      1,
      Math.floor(Math.min(window.innerWidth / width, window.innerHeight / height)),
    );
    canvas.style.width = `${width * scale}px`;
    canvas.style.height = `${height * scale}px`;
  };
  window.addEventListener('resize', resize);
  resize();
  return ctx;
}
