import { describe, expect, it } from "vitest";

import { applyDefaults, resolutionSize, schema } from "../src/config.js";

describe("applyDefaults", () => {
  it("gives a fresh install one Full HD helm display", () => {
    expect(applyDefaults({})).toEqual({
      displays: [
        { id: "helm", name: "Helm", resolution: "1920x1080", readOnly: false },
      ],
    });
    expect(applyDefaults(undefined).displays).toHaveLength(1);
  });

  it("makes an address from the name and keeps addresses unique", () => {
    const { displays } = applyDefaults({
      displays: [
        { name: "Flybridge Ü" },
        { name: "Flybridge Ü" },
        { id: "BAD id!" },
      ],
    });
    expect(displays.map((d) => d.id)).toEqual([
      "flybridge-u",
      "flybridge-u-2",
      "display-3",
    ]);
  });

  it("falls back for an unknown screen size and drops junk entries", () => {
    const { displays } = applyDefaults({
      displays: [
        null,
        { name: "Salon", resolution: "640x480", readOnly: true },
      ],
    });
    expect(displays).toEqual([
      { id: "salon", name: "Salon", resolution: "1920x1080", readOnly: true },
    ]);
  });
});

describe("resolutionSize", () => {
  it("reads both sides", () => {
    expect(resolutionSize("1024x600")).toEqual({ w: 1024, h: 600 });
  });
});

describe("schema", () => {
  it("requires nothing at the top level", () => {
    expect("required" in schema).toBe(false);
  });
});
