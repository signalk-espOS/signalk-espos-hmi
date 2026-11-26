// The layout a display shows before anyone pushed one: the boat's switches
// and tanks as the server knows them, so the first look already does
// something. Only kinds every espOS renderer has, sized for the display.

import type { Layout, LayoutScreen, LayoutWidget } from "./layout.js";

/** Status strip and fixed tab strip, as the panel draws them. */
const STATUS_STRIP_H = 28;
const TAB_STRIP_H = 56;
const MARGIN = 16;
const GAP = 12;

export interface SwitchInfo {
  path: string;
  label: string;
}

export interface TankInfo {
  path: string;
  label: string;
}

type Tree = Record<string, unknown>;

function isTree(v: unknown): v is Tree {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function metaLabel(node: Tree, fallback: string): string {
  const meta = isTree(node.meta) ? node.meta : undefined;
  for (const k of ["displayName", "description"] as const) {
    const v = meta?.[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return fallback;
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Every `<...>.state` leaf under `electrical.switches` whose value is a
 * number or a boolean: the paths a `toggle` can PUT to.
 */
export function findSwitches(switches: unknown): SwitchInfo[] {
  const out: SwitchInfo[] = [];
  const walk = (node: unknown, path: string[]): void => {
    if (!isTree(node)) return;
    const state = node.state;
    if (isTree(state) && "value" in state) {
      const v = state.value;
      if (typeof v === "number" || typeof v === "boolean") {
        const fallback = path.join(" ");
        out.push({
          path: ["electrical", "switches", ...path, "state"].join("."),
          label: metaLabel(state, metaLabel(node, fallback)),
        });
      }
    }
    for (const [k, child] of Object.entries(node)) {
      if (k === "meta" || k === "state" || k === "value") continue;
      walk(child, [...path, k]);
    }
  };
  walk(switches, []);
  return out.sort((a, b) => naturalCompare(a.path, b.path));
}

/** `tanks.<type>.<id>.currentLevel` leaves. */
export function findTanks(tanks: unknown): TankInfo[] {
  const out: TankInfo[] = [];
  if (!isTree(tanks)) return out;
  for (const [type, byId] of Object.entries(tanks)) {
    if (!isTree(byId)) continue;
    for (const [id, tank] of Object.entries(byId)) {
      if (!isTree(tank) || !isTree(tank.currentLevel)) continue;
      const name = isTree(tank.name) ? tank.name.value : undefined;
      const fallback =
        typeof name === "string" && name !== "" ? name : `${type} ${id}`;
      out.push({
        path: `tanks.${type}.${id}.currentLevel`,
        label: metaLabel(tank.currentLevel, fallback),
      });
    }
  }
  return out.sort((a, b) => naturalCompare(a.path, b.path));
}

interface Grid {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
}

/** As many cells of at least `minCellW` × `cellH` as fit, widened to fill. */
function grid(w: number, h: number, minCellW: number, cellH: number): Grid {
  const cols = Math.max(
    1,
    Math.floor((w - 2 * MARGIN + GAP) / (minCellW + GAP)),
  );
  const rows = Math.max(1, Math.floor((h - 2 * MARGIN + GAP) / (cellH + GAP)));
  const cellW = Math.floor((w - 2 * MARGIN - (cols - 1) * GAP) / cols);
  return { cols, rows, cellW, cellH };
}

function switchScreens(
  switches: SwitchInfo[],
  w: number,
  h: number,
): LayoutScreen[] {
  const g = grid(w, h, w >= 1280 ? 300 : 240, w >= 1280 ? 96 : 80);
  const perScreen = g.cols * g.rows;
  const screens: LayoutScreen[] = [];
  for (let start = 0; start < switches.length; start += perScreen) {
    const page = switches.slice(start, start + perScreen);
    const n = screens.length + 1;
    const widgets: LayoutWidget[] = page.map((s, i) => ({
      type: "toggle",
      id: `sw_${start + i}`,
      label: s.label,
      bind: s.path,
      x: MARGIN + (i % g.cols) * (g.cellW + GAP),
      y: MARGIN + Math.floor(i / g.cols) * (g.cellH + GAP),
      w: g.cellW,
      h: g.cellH,
      display: { font_size: w >= 1280 ? 28 : 20 },
    }));
    screens.push({
      id: n === 1 ? "switches" : `switches-${n}`,
      title: n === 1 ? "Switches" : `Switches ${n}`,
      widgets,
    });
  }
  return screens;
}

function tankScreen(tanks: TankInfo[], w: number, h: number): LayoutScreen {
  const shown = tanks.slice(0, 12);
  const cols = Math.min(shown.length, w >= 1280 ? 6 : 4);
  const rows = Math.ceil(shown.length / cols);
  const cellW = Math.floor((w - 2 * MARGIN - (cols - 1) * GAP) / cols);
  const cellH = Math.floor((h - 2 * MARGIN - (rows - 1) * GAP) / rows);
  return {
    id: "tanks",
    title: "Tanks",
    widgets: shown.map((t, i) => ({
      type: "bar",
      id: `tank_${i}`,
      label: t.label,
      bind: t.path,
      min: 0,
      max: 100,
      vertical: true,
      display: { unit: " %", scale: 100, decimals: 0, font_size: 28 },
      x: MARGIN + (i % cols) * (cellW + GAP),
      y: MARGIN + Math.floor(i / cols) * (cellH + GAP),
      w: cellW,
      h: cellH,
    })),
  };
}

/**
 * A layout for a `w` × `h` display from what the server knows. With
 * nothing to show it explains where layouts come from instead.
 */
export function starterLayout(
  displayName: string,
  w: number,
  h: number,
  switches: SwitchInfo[],
  tanks: TankInfo[],
): Layout {
  // Sized as if the tab strip were there: whether it is depends on how
  // many screens the switches fill, and a page a strip shorter than it
  // could be costs nothing.
  const pageH = h - STATUS_STRIP_H - TAB_STRIP_H;
  const screens: LayoutScreen[] = [];
  if (switches.length > 0) screens.push(...switchScreens(switches, w, pageH));
  if (tanks.length > 0) screens.push(tankScreen(tanks, w, pageH));
  if (screens.length === 0) {
    screens.push({
      id: "welcome",
      title: "Welcome",
      widgets: [
        {
          type: "label",
          id: "hint",
          label: `${displayName}: push a layout from the espOS HMI designer`,
          x: MARGIN,
          y: MARGIN,
          w: w - 2 * MARGIN,
          h: 96,
          display: { font_size: 28 },
        },
      ],
    });
  }
  return {
    schema: 1,
    name: `${displayName} (starter)`,
    status_overlay: true,
    theme: { mode: "auto" },
    notifications: { enabled: true, min_state: "alarm" },
    screens,
  };
}
