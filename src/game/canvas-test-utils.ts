/** One recorded fillRect call with the fillStyle active at that moment. */
export interface FillCall {
  fillStyle: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Test-only helper. A fake 2D context that records every fillRect call
 * together with the current fillStyle. Supports nothing else.
 */
export function recorder(): { ctx: CanvasRenderingContext2D; calls: FillCall[] } {
  const calls: FillCall[] = [];
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ fillStyle: this.fillStyle, x, y, w, h });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
