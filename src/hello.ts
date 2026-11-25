// GET /hello for a browser display: the same capability descriptor an
// espOS panel serves, so the HMI designer pushes to a browser display the
// way it pushes to a panel.

import type { DisplayProfile } from "./config.js";
import { resolutionSize } from "./config.js";

const COMMON = ["x", "y", "w", "h", "bg_color", "fg_color"] as const;

/**
 * The widget kinds the browser renderer builds, with the fields /hello
 * lists for each. Taken from the cockpit firmware's widget catalog
 * (main/jlp/widgets/widget_catalog.h), less the kinds that need the
 * panel's own hardware or network: voice, speaker, mic, volume, stream
 * and the anchor widgets.
 */
export const WIDGET_CATALOG: Record<string, { fields: string[] }> = {
  label: {
    fields: [...COMMON, "label", "bind", "display", "show_description"],
  },
  value: { fields: [...COMMON, "label", "bind", "display"] },
  toggle: { fields: [...COMMON, "label", "bind"] },
  arc: {
    fields: [
      ...COMMON,
      "label",
      "bind",
      "display",
      "min",
      "max",
      "start_angle",
      "end_angle",
      "ticks",
      "tick_labels",
      "bands",
    ],
  },
  bar: {
    fields: [...COMMON, "label", "bind", "display", "min", "max", "vertical"],
  },
  bargroup: { fields: [...COMMON, "label", "bars"] },
  button: {
    fields: [
      ...COMMON,
      "label",
      "bind",
      "press_value",
      "release_value",
      "hold_ms",
    ],
  },
  notifications: {
    fields: [
      ...COMMON,
      "label",
      "max_rows",
      "row_height",
      "columns",
      "row_color_field",
      "include_cleared",
    ],
  },
  slider: { fields: [...COMMON, "label", "bind", "display", "min", "max"] },
};

export type LayoutSource = "stored" | "starter";

export interface Hello {
  schema: 1;
  name: string;
  hostname: string;
  firmware: string;
  display: {
    w: number;
    h: number;
    idle_timeout: false;
    tab_strip: string[];
    themes: string[];
  };
  widgets: typeof WIDGET_CATALOG;
  read_only: boolean;
  active_layout_name: string;
  layout_source: LayoutSource;
}

export function buildHello(
  display: DisplayProfile,
  version: string,
  layoutName: string,
  source: LayoutSource,
): Hello {
  const { w, h } = resolutionSize(display.resolution);
  return {
    schema: 1,
    name: layoutName,
    hostname: display.name,
    // The designer reads the trailing M.m.p as the renderer's version,
    // so the version stays last.
    firmware: `espos-hmi-${version}`,
    display: {
      w,
      h,
      // A browser cannot dim the screen it runs on.
      idle_timeout: false,
      tab_strip: ["fixed", "overlay-bottom"],
      themes: ["auto", "day", "dark", "night"],
    },
    widgets: WIDGET_CATALOG,
    read_only: display.readOnly,
    active_layout_name: layoutName,
    layout_source: source,
  };
}
