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
  /**
   * The display whose layout this one shows. Never a follower itself:
   * chains are resolved to the display at their end.
   */
  layoutFrom?: string;
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

function asDisplay(
  raw: unknown,
  index: number,
): { display: DisplayProfile; explicit: boolean; link: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name =
    typeof r.name === "string" && r.name.trim() !== ""
      ? r.name.trim()
      : `Display ${index + 1}`;
  let id = typeof r.id === "string" ? r.id.trim().toLowerCase() : "";
  const explicit = ID_RE.test(id);
  if (!explicit) id = slug(name);
  if (!ID_RE.test(id)) id = `display-${index + 1}`;
  return {
    display: {
      id,
      name,
      resolution: isResolution(r.resolution)
        ? r.resolution
        : DEFAULT_DISPLAY.resolution,
      readOnly: r.readOnly === true,
    },
    explicit,
    link:
      typeof r.layoutFrom === "string" ? r.layoutFrom.trim().toLowerCase() : "",
  };
}

export interface Parsed {
  settings: Settings;
  /** Names of displays whose layoutFrom names no display or a loop. */
  brokenLinks: string[];
  /**
   * The settings to save: complete addresses, and each layoutFrom as the
   * user picked it, so a chain still moves when a display in it changes.
   */
  toSave: Settings;
}

/** Whatever arrived, complete settings: at least one display, unique ids. */
export function applyDefaults(raw: unknown): Settings {
  return parseSettings(raw).settings;
}

export function parseSettings(raw: unknown): Parsed {
  const list =
    typeof raw === "object" &&
    raw !== null &&
    Array.isArray((raw as { displays?: unknown }).displays)
      ? ((raw as { displays: unknown[] }).displays ?? [])
      : [];
  const parsed = list.map((entry, i) => asDisplay(entry, i));
  // Saved addresses are claimed first: a new display named like an old one
  // must not take its address, and with it the old display's layout.
  const seen = new Set<string>();
  const ids = parsed.map((p) => {
    if (!p?.explicit || seen.has(p.display.id)) return null;
    seen.add(p.display.id);
    return p.display.id;
  });
  const displays: DisplayProfile[] = [];
  const links: string[] = [];
  parsed.forEach((p, i) => {
    if (!p) return;
    let id = ids[i] ?? null;
    if (id === null) {
      const base = p.display.id;
      id = base;
      for (let n = 2; seen.has(id); n++) {
        const suffix = `-${n}`;
        id = `${base.slice(0, 32 - suffix.length)}${suffix}`;
      }
      seen.add(id);
    }
    displays.push({ ...p.display, id });
    links.push(p.link);
  });
  if (displays.length === 0) displays.push({ ...DEFAULT_DISPLAY });
  return linkLayouts(displays, links);
}

/**
 * Points each follower straight at the display that owns the layout, so
 * readers of /displays never walk a chain. A link to an unknown display or
 * into a loop leaves the display with its own layout.
 */
function linkLayouts(displays: DisplayProfile[], links: string[]): Parsed {
  const index = new Map(displays.map((d, i) => [d.id, i]));
  const brokenLinks: string[] = [];
  const owner = (start: number): number | null => {
    const seen = new Set([start]);
    let at = start;
    for (;;) {
      const link = links[at] ?? "";
      if (link === "" || link === displays[at]?.id) return at;
      const next = index.get(link);
      if (next === undefined) return at === start ? null : at;
      if (seen.has(next)) return null;
      seen.add(next);
      at = next;
    }
  };
  const linked = displays.map((d, i) => {
    const o = owner(i);
    if (o === null) brokenLinks.push(d.name);
    const source = o === null ? undefined : displays[o];
    return source && source.id !== d.id ? { ...d, layoutFrom: source.id } : d;
  });
  const toSave = displays.map((d, i) => {
    const link = links[i] ?? "";
    return link === "" ? d : { ...d, layoutFrom: link };
  });
  return {
    settings: { displays: linked },
    brokenLinks,
    toSave: { displays: toSave },
  };
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

/**
 * The settings form. The layout picker lists the displays as last saved,
 * so a display added in the same edit shows up there after saving.
 */
export function buildSchema(settings: Settings) {
  return {
    type: "object",
    properties: {
      displays: {
        type: "array",
        title: "Displays",
        description:
          "One entry per screen that shows the HMI. Each has its own layout, pushed from the espOS HMI designer, or shows another display's.",
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
              pattern: "^([a-z0-9][a-z0-9-]{0,31})?$",
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
            layoutFrom: {
              type: "string",
              title: "Layout",
              description:
                "Show another display's layout: a push to that display reaches this one too.",
              default: "",
              oneOf: [
                { const: "", title: "Its own layout" },
                ...settings.displays.map((d) => ({
                  const: d.id,
                  title: `The layout of ${d.name}`,
                })),
              ],
            },
          },
        },
      },
    },
  } as const;
}

export const uiSchema = {
  displays: {
    items: {
      "ui:order": ["name", "resolution", "layoutFrom", "readOnly", "id"],
      id: { "ui:placeholder": "helm" },
    },
  },
} as const;
