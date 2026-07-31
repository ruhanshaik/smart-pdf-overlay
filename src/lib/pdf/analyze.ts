/**
 * Page layout analysis.
 *
 * Each page is rasterised at a low resolution and reduced to a per-row "ink"
 * profile. The profile is used to locate the top-most and bottom-most content
 * rows and the first significant vertical gap after them, which is the most
 * reliable signal for where a header block ends and a footer block begins.
 */

export interface PageAnalysis {
  /** Page index (0-based). */
  index: number;
  /** Height of the detected header band, in PDF points, measured from the page top. */
  headerBand: number;
  /** Height of the detected footer band, in PDF points, measured from the page bottom. */
  footerBand: number;
}

/** Maximum share of the page height that may ever be treated as header/footer. */
const MAX_BAND_RATIO = 0.2;
/** Blank rows (in analysis pixels) required to consider a block finished. */
const GAP_ROWS = 6;
/** A row counts as inked when at least this share of its pixels are non-white. */
const ROW_INK_THRESHOLD = 0.004;

export function inkProfile(data: Uint8ClampedArray, width: number, height: number): number[] {
  const rows = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y++) {
    let inked = 0;
    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = base + x * 4;
      const alpha = data[i + 3]!;
      if (alpha < 16) continue;
      const luminance = (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) / 255;
      if (luminance < 0.93) inked++;
    }
    rows[y] = inked / width;
  }
  return rows;
}

/**
 * Finds the end of the leading block of content, scanning from `from` towards
 * the end of the array. Returns null when no clean gap exists inside the cap,
 * meaning body content starts immediately and nothing should be covered.
 */
function blockEnd(rows: number[], cap: number): number | null {
  let start = -1;
  for (let y = 0; y < cap; y++) {
    if (rows[y]! > ROW_INK_THRESHOLD) {
      start = y;
      break;
    }
  }
  if (start === -1) return 0; // fully blank margin area
  let blank = 0;
  for (let y = start; y < cap; y++) {
    if (rows[y]! > ROW_INK_THRESHOLD) {
      blank = 0;
    } else {
      blank++;
      if (blank >= GAP_ROWS) return y - blank + 1;
    }
  }
  return null;
}

/**
 * Derives header/footer band heights (in PDF points) from a rasterised page.
 *
 * @param rows      per-row ink ratios, top to bottom
 * @param pxHeight  raster height in pixels
 * @param ptHeight  page height in PDF points
 */
export function bandsFromProfile(rows: number[], pxHeight: number, ptHeight: number) {
  const cap = Math.max(1, Math.floor(pxHeight * MAX_BAND_RATIO));
  const scale = ptHeight / pxHeight;

  const top = blockEnd(rows, cap);
  const reversed = [...rows].reverse();
  const bottom = blockEnd(reversed, cap);

  return {
    headerBand: (top ?? 0) * scale,
    footerBand: (bottom ?? 0) * scale,
  };
}
