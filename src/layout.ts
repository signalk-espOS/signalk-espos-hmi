// The parts of a JLP layout the plugin itself needs to read. The full
// schema lives in the designer (schema.ts) and the firmware
// (JLP-PROTOCOL.md); the renderer in the browser validates everything else.
// Shared with the webapp, so nothing here may need Node.

/** The firmware's POST /layout cap; a browser display keeps the same. */
export const MAX_LAYOUT_BYTES = 64 * 1024;

export interface LayoutWidget {
  type: string;
  id: string;
  [field: string]: unknown;
}

export interface LayoutScreen {
  id: string;
  title?: string;
  widgets: LayoutWidget[];
}

export interface Layout {
  schema: 1;
  name: string;
  screens: LayoutScreen[];
  [field: string]: unknown;
}

export type LayoutCheck =
  { ok: true; layout: Layout; widgets: number } | { ok: false; err: string };

/**
 * The checks that decide whether a layout is worth storing: the envelope
 * the firmware rejects first. Widget kinds and fields are the renderer's
 * to judge, like on the panel.
 */
export function checkLayout(body: unknown): LayoutCheck {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, err: "layout must be a JSON object" };
  }
  const size = new TextEncoder().encode(JSON.stringify(body)).length;
  if (size > MAX_LAYOUT_BYTES) return { ok: false, err: "layout too large" };
  const l = body as Record<string, unknown>;
  if (l.schema !== 1) {
    return {
      ok: false,
      err: `unsupported schema ${String(l.schema)} (want 1)`,
    };
  }
  if (typeof l.name !== "string") return { ok: false, err: "name missing" };
  if (!Array.isArray(l.screens) || l.screens.length === 0) {
    return { ok: false, err: "no screens" };
  }
  const screenIds = new Set<string>();
  let widgets = 0;
  for (const s of l.screens as unknown[]) {
    if (typeof s !== "object" || s === null) {
      return { ok: false, err: "screen must be an object" };
    }
    const scr = s as Record<string, unknown>;
    if (typeof scr.id !== "string")
      return { ok: false, err: "screen missing id" };
    if (screenIds.has(scr.id)) {
      return { ok: false, err: `duplicate screen id: ${scr.id}` };
    }
    screenIds.add(scr.id);
    if (!Array.isArray(scr.widgets)) {
      return { ok: false, err: `screen ${scr.id} has no widgets` };
    }
    widgets += scr.widgets.length;
  }
  return { ok: true, layout: body as Layout, widgets };
}

/** Every Signal K path a layout binds, sub-bars included. */
export function boundPaths(layout: Layout): string[] {
  const paths = new Set<string>();
  for (const s of layout.screens) {
    for (const w of s.widgets) {
      if (typeof w.bind === "string" && !w.bind.startsWith("@")) {
        paths.add(w.bind);
      }
      if (Array.isArray(w.bars)) {
        for (const b of w.bars as unknown[]) {
          const bind = (b as { bind?: unknown } | null)?.bind;
          if (typeof bind === "string" && !bind.startsWith("@")) {
            paths.add(bind);
          }
        }
      }
    }
  }
  return [...paths];
}
