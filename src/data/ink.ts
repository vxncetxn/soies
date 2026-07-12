/**
 * Ink — durable strokes + display overlay for one artefact (ADR-0008).
 *
 * `annotations` column stores versioned stroke JSON. Overlay PNG is a sibling
 * media file (`{artefactId}.ink.png`) regenerated on Scribble Save.
 *
 * Filename policy lives in `storage/files` so data → storage dependency stays
 * one-way (storage does not import this module).
 */

export type InkPoint = {
  x: number;
  y: number;
  t: number;
  pressure?: number;
  size?: number;
  azimuth?: number;
  altitude?: number;
};

export type InkStroke = {
  color: string;
  minWidth: number;
  maxWidth: number;
  points: InkPoint[];
};

export type InkCanvasSize = {
  width: number;
  height: number;
};

export type InkDocument = {
  version: 2;
  /** Source canvas in density-independent units; load scales into the target canvas. */
  canvas: InkCanvasSize;
  strokes: InkStroke[];
};

/** In-memory draft Ink during create (before entry submit). */
export type DraftInk = {
  document: InkDocument;
  /** Local file URI for the PNG overlay cache (temp or durable). */
  overlayUri: string;
};

const MAX_ANNOTATIONS_JSON_LENGTH = 8_000_000;
const MAX_STROKES = 1_000;
const MAX_POINTS_PER_STROKE = 50_000;
const MAX_TOTAL_POINTS = 200_000;
const MAX_COORDINATE = 100_000;
const MAX_CANVAS_DIMENSION = 100_000;
const MAX_STROKE_WIDTH = 512;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

export function emptyInkDocument(canvas: InkCanvasSize): InkDocument {
  return { version: 2, canvas, strokes: [] };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

function parseCanvasSize(raw: unknown): InkCanvasSize | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const canvas = raw as Record<string, unknown>;
  if (
    !isNumberInRange(canvas.width, Number.EPSILON, MAX_CANVAS_DIMENSION) ||
    !isNumberInRange(canvas.height, Number.EPSILON, MAX_CANVAS_DIMENSION)
  ) {
    return null;
  }
  return { width: canvas.width, height: canvas.height };
}

function parseInkPoint(raw: unknown): InkPoint | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const point = raw as Record<string, unknown>;
  if (
    !isNumberInRange(point.x, -MAX_COORDINATE, MAX_COORDINATE) ||
    !isNumberInRange(point.y, -MAX_COORDINATE, MAX_COORDINATE) ||
    !isNumberInRange(point.t, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return null;
  }
  const parsed: InkPoint = { x: point.x, y: point.y, t: point.t };
  if (point.pressure !== undefined) {
    if (!isNumberInRange(point.pressure, 0, 1)) {
      return null;
    }
    parsed.pressure = point.pressure;
  }
  if (point.size !== undefined) {
    if (!isNumberInRange(point.size, Number.EPSILON, MAX_STROKE_WIDTH)) {
      return null;
    }
    parsed.size = point.size;
  }
  if (point.azimuth !== undefined) {
    // PencilKit can serialize the same circular direction as a signed angle
    // (for example, -3.10 instead of 3.18). Keep a finite two-turn bound while
    // accepting both native representations so valid iOS strokes can persist.
    if (!isNumberInRange(point.azimuth, -TWO_PI, TWO_PI)) {
      return null;
    }
    parsed.azimuth = point.azimuth;
  }
  if (point.altitude !== undefined) {
    if (!isNumberInRange(point.altitude, 0, HALF_PI)) {
      return null;
    }
    parsed.altitude = point.altitude;
  }
  return parsed;
}

function parseInkStroke(raw: unknown): InkStroke | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const stroke = raw as Record<string, unknown>;
  if (
    !Array.isArray(stroke.points) ||
    stroke.points.length === 0 ||
    stroke.points.length > MAX_POINTS_PER_STROKE
  ) {
    return null;
  }
  const points: InkPoint[] = [];
  for (const entry of stroke.points) {
    const point = parseInkPoint(entry);
    if (!point) {
      return null;
    }
    points.push(point);
  }
  if (
    typeof stroke.color !== "string" ||
    !HEX_COLOR_PATTERN.test(stroke.color) ||
    !isNumberInRange(stroke.minWidth, Number.EPSILON, MAX_STROKE_WIDTH) ||
    !isNumberInRange(stroke.maxWidth, stroke.minWidth, MAX_STROKE_WIDTH)
  ) {
    return null;
  }
  return {
    color: stroke.color,
    minWidth: stroke.minWidth,
    maxWidth: stroke.maxWidth,
    points,
  };
}

export function parseAnnotations(raw: string | null | undefined): InkDocument | null {
  if (raw == null || raw === "" || raw.length > MAX_ANNOTATIONS_JSON_LENGTH) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { version?: number; canvas?: unknown; strokes?: unknown };
    const canvas = parseCanvasSize(parsed.canvas);
    if (
      parsed.version !== 2 ||
      !canvas ||
      !Array.isArray(parsed.strokes) ||
      parsed.strokes.length === 0 ||
      parsed.strokes.length > MAX_STROKES
    ) {
      return null;
    }
    const strokes: InkStroke[] = [];
    let totalPoints = 0;
    for (const entry of parsed.strokes) {
      const stroke = parseInkStroke(entry);
      if (!stroke) {
        return null;
      }
      totalPoints += stroke.points.length;
      if (totalPoints > MAX_TOTAL_POINTS) {
        return null;
      }
      strokes.push(stroke);
    }
    return { version: 2, canvas, strokes };
  } catch {
    return null;
  }
}

export function serializeAnnotations(document: InkDocument): string | null {
  if (document.strokes.length === 0) {
    return null;
  }
  return JSON.stringify(document);
}

/** Normalize library StrokeData (enriched or legacy) into InkStroke[]. */
export function inkStrokesFromStrokeData(data: unknown): InkStroke[] {
  if (!Array.isArray(data) || data.length > MAX_STROKES) {
    throw new Error("Ink snapshot contains invalid stroke data.");
  }
  const strokes: InkStroke[] = [];
  let totalPoints = 0;
  for (const entry of data) {
    const stroke = parseInkStroke(
      Array.isArray(entry) ? { color: "#111111", minWidth: 1, maxWidth: 3, points: entry } : entry,
    );
    if (!stroke) {
      throw new Error("Ink snapshot contains an invalid stroke.");
    }
    totalPoints += stroke.points.length;
    if (totalPoints > MAX_TOTAL_POINTS) {
      throw new Error("Ink snapshot exceeds the supported point count.");
    }
    strokes.push(stroke);
  }
  return strokes;
}

export function strokeDataForCanvas(document: InkDocument, target: InkCanvasSize) {
  const scaleX = target.width / document.canvas.width;
  const scaleY = target.height / document.canvas.height;
  const widthScale = Math.min(scaleX, scaleY);
  return document.strokes.map((stroke) => ({
    color: stroke.color,
    minWidth: stroke.minWidth * widthScale,
    maxWidth: stroke.maxWidth * widthScale,
    points: stroke.points.map((point) => ({
      ...point,
      x: point.x * scaleX,
      y: point.y * scaleY,
      size: point.size === undefined ? undefined : point.size * widthScale,
    })),
  }));
}
