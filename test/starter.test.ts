import { describe, expect, it } from "vitest";

import { checkLayout } from "../src/layout.js";
import { findSwitches, findTanks, starterLayout } from "../src/starter.js";

const switches = {
  venus: {
    "10": { state: { value: 1, meta: { displayName: "Anchor light" } } },
    "2": { state: { value: false }, meta: { description: "Bilge pump" } },
    text: { state: { value: "on" } },
  },
};

const tanks = {
  freshWater: { "0": { currentLevel: { value: 0.5 }, name: { value: "Bow" } } },
  fuel: { "1": { currentLevel: { value: 0.8 } } },
};

describe("findSwitches", () => {
  it("finds numeric and boolean states in natural order with their names", () => {
    expect(findSwitches(switches)).toEqual([
      { path: "electrical.switches.venus.2.state", label: "Bilge pump" },
      { path: "electrical.switches.venus.10.state", label: "Anchor light" },
    ]);
  });

  it("copes with nothing", () => {
    expect(findSwitches(undefined)).toEqual([]);
  });
});

describe("findTanks", () => {
  it("names tanks by their name, else by type and id", () => {
    expect(findTanks(tanks)).toEqual([
      { path: "tanks.freshWater.0.currentLevel", label: "Bow" },
      { path: "tanks.fuel.1.currentLevel", label: "fuel 1" },
    ]);
  });
});

describe("starterLayout", () => {
  const inside =
    (w: number, h: number) =>
    (x: Record<string, unknown>): boolean => {
      const { x: wx, y: wy, w: ww, h: wh } = x as Record<string, number>;
      return (
        [wx, wy, ww, wh].every((n) => typeof n === "number") &&
        (wx ?? -1) >= 0 &&
        (wy ?? -1) >= 0 &&
        (wx ?? 0) + (ww ?? 0) <= w &&
        (wy ?? 0) + (wh ?? 0) <= h
      );
    };

  it("explains itself on a server with nothing to show", () => {
    const l = starterLayout("Helm", 1920, 1080, [], []);
    expect(checkLayout(l).ok).toBe(true);
    expect(l.screens.map((s) => s.id)).toEqual(["welcome"]);
  });

  it("pages many switches and keeps every widget on the page", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      path: `electrical.switches.b.${i}.state`,
      label: `S${i}`,
    }));
    for (const [w, h] of [
      [1920, 1080],
      [1024, 600],
      [800, 480],
    ] as const) {
      const l = starterLayout("Helm", w, h, many, findTanks(tanks));
      expect(checkLayout(l).ok).toBe(true);
      const ids = l.screens.flatMap((s) => s.widgets.map((x) => x.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.filter((id) => id.startsWith("sw_"))).toHaveLength(40);
      for (const s of l.screens) {
        expect(s.widgets.every(inside(w, h - 28 - 56))).toBe(true);
      }
      expect(l.screens.at(-1)?.id).toBe("tanks");
    }
  });
});
