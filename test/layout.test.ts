import { describe, expect, it } from "vitest";

import { boundPaths, checkLayout, MAX_LAYOUT_BYTES } from "../src/layout.js";

const ok = {
  schema: 1,
  name: "Helm",
  screens: [
    {
      id: "main",
      widgets: [
        { type: "toggle", id: "a", bind: "electrical.switches.bank.1.state" },
        { type: "label", id: "b", bind: "@clock" },
        {
          type: "bargroup",
          id: "c",
          bars: [{ bind: "tanks.fuel.0.currentLevel" }, { bind: 5 }, null],
        },
      ],
    },
  ],
};

describe("checkLayout", () => {
  it("takes a well-formed layout and counts its widgets", () => {
    const r = checkLayout(ok);
    expect(r.ok && r.widgets).toBe(3);
  });

  it.each([
    [null, "layout must be a JSON object"],
    [[], "layout must be a JSON object"],
    [{ ...ok, schema: 2 }, "unsupported schema 2 (want 1)"],
    [{ ...ok, name: 3 }, "name missing"],
    [{ ...ok, screens: [] }, "no screens"],
    [
      {
        ...ok,
        screens: [
          { id: "a", widgets: [] },
          { id: "a", widgets: [] },
        ],
      },
      "duplicate screen id: a",
    ],
    [{ ...ok, screens: [{ id: "a" }] }, "screen a has no widgets"],
  ])("refuses %j", (body, err) => {
    expect(checkLayout(body)).toEqual({ ok: false, err });
  });

  it("refuses a layout over the panel's size cap", () => {
    const big = { ...ok, name: "x".repeat(MAX_LAYOUT_BYTES) };
    expect(checkLayout(big)).toEqual({ ok: false, err: "layout too large" });
  });
});

describe("boundPaths", () => {
  it("lists Signal K binds, sub-bars included, and skips local sources", () => {
    const r = checkLayout(ok);
    if (!r.ok) throw new Error(r.err);
    expect(boundPaths(r.layout).sort()).toEqual([
      "electrical.switches.bank.1.state",
      "tanks.fuel.0.currentLevel",
    ]);
  });
});
