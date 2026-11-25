// Fitting a fixed-size display into whatever window the browser has.

export interface Box {
  /** CSS pixels. */
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
}

/**
 * The largest box with the display's aspect ratio that fits the window,
 * centred. A window of exactly the display's size gets scale 1, so a
 * Full HD layout on a Full HD screen is drawn pixel for pixel.
 */
export function fitBox(
  dispW: number,
  dispH: number,
  winW: number,
  winH: number,
): Box {
  const scale = Math.min(winW / dispW, winH / dispH);
  const width = Math.floor(dispW * scale);
  const height = Math.floor(dispH * scale);
  return {
    left: Math.floor((winW - width) / 2),
    top: Math.floor((winH - height) / 2),
    width,
    height,
    scale,
  };
}

/** A pointer position on the page, in display pixels, or null outside it. */
export function toDisplay(
  box: Box,
  dispW: number,
  dispH: number,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const x = ((clientX - box.left) / box.width) * dispW;
  const y = ((clientY - box.top) / box.height) * dispH;
  if (x < 0 || y < 0 || x >= dispW || y >= dispH) return null;
  return { x, y };
}
