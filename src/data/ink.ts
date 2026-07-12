/**
 * Ink — durable strokes + display overlay for one artefact (ADR-0008).
 *
 * `annotations` column stores versioned stroke JSON. Overlay PNG is a sibling
 * media file (`{artefactId}.ink.png`) regenerated on Scribble Save.
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

export type InkDocument = {
  version: 1;
  strokes: InkStroke[];
};

/** In-memory draft Ink during create (before entry submit). */
export type DraftInk = {
  document: InkDocument;
  /** Local file URI for the PNG overlay cache (temp or durable). */
  overlayUri: string;
};

export const INK_OVERLAY_EXT = "ink.png";

export function inkOverlayFileName(artefactId: string): string {
  return `${artefactId}.${INK_OVERLAY_EXT}`;
}

export function emptyInkDocument(): InkDocument {
  return { version: 1, strokes: [] };
}

export function parseAnnotations(raw: string | null | undefined): InkDocument | null {
  if (raw == null || raw === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { version?: number; strokes?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.strokes)) {
      return null;
    }
    const strokes: InkStroke[] = [];
    for (const entry of parsed.strokes) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const stroke = entry as Partial<InkStroke>;
      if (!Array.isArray(stroke.points) || stroke.points.length === 0) {
        continue;
      }
      strokes.push({
        color: typeof stroke.color === "string" ? stroke.color : "#111111",
        minWidth: typeof stroke.minWidth === "number" ? stroke.minWidth : 1,
        maxWidth: typeof stroke.maxWidth === "number" ? stroke.maxWidth : 3,
        points: stroke.points as InkPoint[],
      });
    }
    if (strokes.length === 0) {
      return null;
    }
    return { version: 1, strokes };
  } catch {
    return null;
  }
}

export function serializeAnnotations(document: InkDocument): string | null {
  if (document.strokes.length === 0) {
    return null;
  }
  return JSON.stringify({ version: 1, strokes: document.strokes } satisfies InkDocument);
}

/** Normalize library StrokeData (enriched or legacy) into InkStroke[]. */
export function inkStrokesFromStrokeData(data: unknown): InkStroke[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const strokes: InkStroke[] = [];
  for (const entry of data) {
    if (Array.isArray(entry)) {
      if (entry.length === 0) {
        continue;
      }
      strokes.push({
        color: "#111111",
        minWidth: 1,
        maxWidth: 3,
        points: entry as InkPoint[],
      });
      continue;
    }
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as {
      color?: string;
      minWidth?: number;
      maxWidth?: number;
      points?: InkPoint[];
    };
    if (!Array.isArray(record.points) || record.points.length === 0) {
      continue;
    }
    strokes.push({
      color: typeof record.color === "string" ? record.color : "#111111",
      minWidth: typeof record.minWidth === "number" ? record.minWidth : 1,
      maxWidth: typeof record.maxWidth === "number" ? record.maxWidth : 3,
      points: record.points,
    });
  }
  return strokes;
}

export function strokeDataFromInkStrokes(strokes: InkStroke[]) {
  return strokes.map((stroke) => ({
    color: stroke.color,
    minWidth: stroke.minWidth,
    maxWidth: stroke.maxWidth,
    points: stroke.points,
  }));
}
