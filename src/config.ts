// Plugin settings. Signal K starts the plugin with `{}` until the form is
// saved once, so everything goes through applyDefaults() and the schema's
// defaults come from the same constants.

/** Screen sizes a helm display is likely to have, largest first. */
export const RESOLUTIONS = [
  { id: "1920x1080", title: "1920 × 1080: Full HD helm monitor" },
  { id: "2560x1600", title: "2560 × 1600: large tablet" },
  { id: "1280x800", title: "1280 × 800: 10 inch tablet or Pi display" },
  { id: "1280x720", title: "1280 × 720: HD monitor" },
  { id: "1024x600", title: "1024 × 600: same as the 7 inch espOS panel" },
  { id: "800x480", title: "800 × 480: small Pi display" },
] as const;

export type ResolutionId = (typeof RESOLUTIONS)[number]["id"];

export interface DisplayProfile {
  /** URL-safe, unique: the webapp opens a display with ?display=<id>. */
  id: string;
  name: string;
  resolution: ResolutionId;
  /** Shows values but never switches anything, whoever taps it. */
  readOnly: boolean;
}

export interface Settings {
  displays: DisplayProfile[];
}

export const DEFAULT_DISPLAY: DisplayProfile = {
  id: "helm",
  name: "Helm",
  resolution: "1920x1080",
  readOnly: false,
};

const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

function isResolution(v: unknown): v is ResolutionId {
  return RESOLUTIONS.some((r) => r.id === v);
}

export function resolutionSize(id: ResolutionId): { w: number; h: number } {
  const [w, h] = id.split("x").map(Number);
  return { w: w ?? 1920, h: h ?? 1080 };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function asDisplay(raw: unknown, index: number): DisplayProfile | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name =
    typeof r.name === "string" && r.name.trim() !== ""
      ? r.name.trim()
      : `Display ${index + 1}`;
  let id = typeof r.id === "string" ? r.id.trim().toLowerCase() : "";
  if (!ID_RE.test(id)) id = slug(name);
  if (!ID_RE.test(id)) id = `display-${index + 1}`;
  return {
    id,
    name,
    resolution: isResolution(r.resolution)
      ? r.resolution
      : DEFAULT_DISPLAY.resolution,
    readOnly: r.readOnly === true,
  };
}

/** Whatever arrived, complete settings: at least one display, unique ids. */
export function applyDefaults(raw: unknown): Settings {
  const list =
    typeof raw === "object" &&
    raw !== null &&
    Array.isArray((raw as { displays?: unknown }).displays)
      ? ((raw as { displays: unknown[] }).displays ?? [])
      : [];
  const seen = new Set<string>();
  const displays: DisplayProfile[] = [];
  list.forEach((entry, i) => {
    const d = asDisplay(entry, i);
    if (!d) return;
    let id = d.id;
    for (let n = 2; seen.has(id); n++) id = `${d.id.slice(0, 29)}-${n}`;
    seen.add(id);
    displays.push({ ...d, id });
  });
  if (displays.length === 0) displays.push({ ...DEFAULT_DISPLAY });
  return { displays };
}

/**
 * True when settings saved by the form lack an address that applyDefaults
 * had to make up, so the made-up ones should be saved. A fresh install
 * (`{}`) gets the fixed default address and needs nothing saved.
 */
export function addressesMissing(raw: unknown, settings: Settings): boolean {
  const list = (raw as { displays?: unknown } | null)?.displays;
  if (!Array.isArray(list)) return false;
  if (list.length !== settings.displays.length) return true;
  return list.some(
    (entry, i) =>
      (entry as { id?: unknown } | null)?.id !== settings.displays[i]?.id,
  );
}

export const schema = {
  type: "object",
  properties: {
    displays: {
      type: "array",
      title: "Displays",
      description:
        "One entry per screen that shows the HMI. Each has its own layout; push one from the espOS HMI designer.",
      default: [DEFAULT_DISPLAY],
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
            title: "Name",
            default: DEFAULT_DISPLAY.name,
          },
          id: {
            type: "string",
            title: "Address",
            description:
              "Short name in the display's web address (?display=…). Left empty, it is made from the name.",
            pattern: "^[a-z0-9][a-z0-9-]{0,31}$",
          },
          resolution: {
            type: "string",
            title: "Screen size",
            default: DEFAULT_DISPLAY.resolution,
            oneOf: RESOLUTIONS.map((r) => ({ const: r.id, title: r.title })),
          },
          readOnly: {
            type: "boolean",
            title: "Show values only, never switch anything",
            default: false,
          },
        },
      },
    },
  },
} as const;

export const uiSchema = {
  displays: {
    items: {
      "ui:order": ["name", "resolution", "readOnly", "id"],
      id: { "ui:placeholder": "helm" },
    },
  },
} as const;
