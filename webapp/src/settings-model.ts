// The display list as the settings page edits it. Pure, so the rules are
// tested without a browser.

export interface EditDisplay {
  /** Empty for a display not saved yet: the server makes one from the name. */
  id: string;
  name: string;
  resolution: string;
  readOnly: boolean;
  /** Empty for an own layout. */
  layoutFrom: string;
}

export interface Choice {
  value: string;
  label: string;
}

export function fromServer(raw: unknown): EditDisplay[] {
  const list = (raw as { displays?: unknown } | null)?.displays;
  if (!Array.isArray(list)) return [];
  return list.map((entry) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    return {
      id: typeof d.id === "string" ? d.id : "",
      name: typeof d.name === "string" ? d.name : "",
      resolution: typeof d.resolution === "string" ? d.resolution : "",
      readOnly: d.readOnly === true,
      layoutFrom: typeof d.layoutFrom === "string" ? d.layoutFrom : "",
    };
  });
}

/**
 * What display `index` can show: its own layout, or the layout of another
 * saved display that has its own. Followers are not offered, so no chain
 * is ever picked.
 */
export function layoutChoices(
  displays: readonly EditDisplay[],
  index: number,
): Choice[] {
  const self = displays[index];
  const choices: Choice[] = [{ value: "", label: "Own layout" }];
  for (const d of displays) {
    if (d === self || d.id === "" || d.layoutFrom !== "") continue;
    choices.push({ value: d.id, label: d.name || d.id });
  }
  return choices;
}

/** Names of the displays that show the layout of display `index`. */
export function followersOf(
  displays: readonly EditDisplay[],
  index: number,
): string[] {
  const id = displays[index]?.id ?? "";
  if (id === "") return [];
  return displays.filter((d) => d.layoutFrom === id).map((d) => d.name || d.id);
}

/**
 * Display `index` shows `source`'s layout from now on. Displays that
 * followed it move along to `source`, so they keep showing the same thing.
 */
export function setLayoutFrom(
  displays: readonly EditDisplay[],
  index: number,
  source: string,
): EditDisplay[] {
  const id = displays[index]?.id ?? "";
  return displays.map((d, i) => {
    if (i === index) return { ...d, layoutFrom: source };
    if (source !== "" && id !== "" && d.layoutFrom === id) {
      return { ...d, layoutFrom: source === d.id ? "" : source };
    }
    return d;
  });
}

/** Removes display `index`; its followers go back to their own layout. */
export function removeDisplay(
  displays: readonly EditDisplay[],
  index: number,
): EditDisplay[] {
  const id = displays[index]?.id ?? "";
  return displays
    .filter((_, i) => i !== index)
    .map((d) =>
      id !== "" && d.layoutFrom === id ? { ...d, layoutFrom: "" } : d,
    );
}

export function addDisplay(
  displays: readonly EditDisplay[],
  resolution: string,
): EditDisplay[] {
  return [
    ...displays,
    {
      id: "",
      name: `Display ${displays.length + 1}`,
      resolution,
      readOnly: false,
      layoutFrom: "",
    },
  ];
}

export function toServer(displays: readonly EditDisplay[]): {
  displays: Record<string, unknown>[];
} {
  return {
    displays: displays.map((d) => ({
      ...(d.id === "" ? {} : { id: d.id }),
      name: d.name.trim(),
      resolution: d.resolution,
      readOnly: d.readOnly,
      ...(d.layoutFrom === "" ? {} : { layoutFrom: d.layoutFrom }),
    })),
  };
}
