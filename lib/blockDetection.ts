import sharp from 'sharp';

// A detected colored class block, in ORIGINAL image pixel coordinates.
export interface BlockRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Downscale width for detection — keeps it fast and merges anti-aliased edges.
const DETECT_WIDTH = 600;

/**
 * Detect the colored class-block rectangles in a CalCentral/Schedule-Planner
 * screenshot via pixel analysis.
 *
 * The grid is white with light-gray lines; the page header is dark navy; the
 * class blocks are pale, lightly-saturated pastels (red/blue/green) with a
 * solid colored bar on their left edge. We classify each pixel as "block" if it
 * carries enough color saturation while staying bright (excludes white, gray
 * gridlines, dark header, and black text), then group block pixels into
 * rectangles by row spans.
 */
export async function detectBlockRegions(imageBuffer: Buffer): Promise<BlockRegion[]> {
  const meta = await sharp(imageBuffer).metadata();
  const origWidth = meta.width ?? DETECT_WIDTH;
  const origHeight = meta.height ?? 0;
  if (!origWidth || !origHeight) return [];

  const scale = origWidth / DETECT_WIDTH;
  const targetW = DETECT_WIDTH;
  const targetH = Math.max(1, Math.round(origHeight / scale));

  const { data, info } = await sharp(imageBuffer)
    .resize(targetW, targetH, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const channels = info.channels; // 3 after removeAlpha

  // Per-pixel mask: 1 if the pixel looks like a pastel block fill/bar.
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    if (isBlockPixel(r, g, b)) mask[i] = 1;
  }

  // For each row, find horizontal runs of block pixels wide enough to be a
  // block (not a stray gridline pixel or text artifact).
  const minRunPx = Math.round(w * 0.04); // ~4% of width
  const rowRuns: { row: number; start: number; end: number }[] = [];
  for (let y = 0; y < h; y++) {
    let runStart = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && mask[y * w + x] === 1;
      if (on && runStart < 0) {
        runStart = x;
      } else if (!on && runStart >= 0) {
        if (x - runStart >= minRunPx) {
          rowRuns.push({ row: y, start: runStart, end: x });
        }
        runStart = -1;
      }
    }
  }

  // Merge vertically-adjacent, horizontally-overlapping runs into rectangles.
  // A small vertical gap (anti-aliasing / icon row) is bridged; a real gap
  // between two stacked blocks is larger and splits them.
  const maxRowGap = Math.max(2, Math.round(h * 0.012));
  type Rect = { x0: number; x1: number; y0: number; y1: number };
  const rects: Rect[] = [];

  for (const run of rowRuns) {
    let merged = false;
    for (const rect of rects) {
      const overlapX = run.start < rect.x1 && run.end > rect.x0;
      const closeY = run.row <= rect.y1 + maxRowGap;
      if (overlapX && closeY) {
        rect.x0 = Math.min(rect.x0, run.start);
        rect.x1 = Math.max(rect.x1, run.end);
        rect.y1 = Math.max(rect.y1, run.row);
        merged = true;
        break;
      }
    }
    if (!merged) {
      rects.push({ x0: run.start, x1: run.end, y0: run.row, y1: run.row });
    }
  }

  // Filter noise and rescale to original coordinates.
  const minBlockH = Math.round(h * 0.02);
  const minBlockW = minRunPx;
  return rects
    .filter((r) => r.y1 - r.y0 >= minBlockH && r.x1 - r.x0 >= minBlockW)
    .map((r) => ({
      x: Math.round(r.x0 * scale),
      y: Math.round(r.y0 * scale),
      width: Math.round((r.x1 - r.x0) * scale),
      height: Math.round((r.y1 - r.y0) * scale),
    }));
}

/**
 * A pixel belongs to a class block if it is reasonably bright (not the dark
 * navy header, not black text) AND carries some color (not white background,
 * not gray gridlines). Pastels and the saturated left-edge bars both pass.
 */
function isBlockPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Exclude dark pixels (navy header ~#1b2a52, black text).
  if (max < 90) return false;
  // Exclude near-white background.
  if (min > 245) return false;
  // Exclude grays (gridlines, shadows): low color spread.
  if (delta < 12) return false;

  return true;
}
