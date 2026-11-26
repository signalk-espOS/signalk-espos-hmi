import { describe, expect, it } from "vitest";

import {
  addressesMissing,
  applyDefaults,
  parseSettings,
  resolutionSize,
  schema,
} from "../src/config.js";

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

  it("keeps a saved address when a new display is named like it", () => {
    const { displays } = applyDefaults({
      displays: [{ name: "Helm" }, { id: "helm", name: "Salon" }],
    });
    expect(displays.map((d) => d.id)).toEqual(["helm-2", "helm"]);
  });

  it("keeps made-up addresses within 32 characters", () => {
    const long = "a".repeat(40);
    const { displays } = applyDefaults({
      displays: Array.from({ length: 101 }, () => ({ name: long })),
    });
    const last = displays.at(-1)?.id ?? "";
    expect(last).toBe(`${"a".repeat(28)}-101`);
    expect(new Set(displays.map((d) => d.id)).size).toBe(101);
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

describe("layoutFrom", () => {
  const ids = (raw: unknown) =>
    applyDefaults(raw).displays.map((d) => [d.id, d.layoutFrom]);

  it("points a follower at the display it names", () => {
    expect(
      ids({
        displays: [
          { id: "helm", name: "Helm" },
          { id: "salon", name: "Salon", layoutFrom: "Helm " },
        ],
      }),
    ).toEqual([
      ["helm", undefined],
      ["salon", "helm"],
    ]);
  });

  it("resolves a chain to the display at its end", () => {
    expect(
      ids({
        displays: [
          { id: "fly", name: "Fly" },
          { id: "helm", name: "Helm", layoutFrom: "fly" },
          { id: "salon", name: "Salon", layoutFrom: "helm" },
        ],
      }),
    ).toEqual([
      ["fly", undefined],
      ["helm", "fly"],
      ["salon", "fly"],
    ]);
  });

  it("treats empty and self links as an own layout", () => {
    const { settings, brokenLinks } = parseSettings({
      displays: [
        { id: "helm", name: "Helm", layoutFrom: "" },
        { id: "salon", name: "Salon", layoutFrom: "salon" },
      ],
    });
    expect(settings.displays.every((d) => !("layoutFrom" in d))).toBe(true);
    expect(brokenLinks).toEqual([]);
  });

  it("gives unknown displays and loops their own layout and reports them", () => {
    const { settings, brokenLinks } = parseSettings({
      displays: [
        { id: "a", name: "A", layoutFrom: "b" },
        { id: "b", name: "B", layoutFrom: "a" },
        { id: "c", name: "C", layoutFrom: "gone" },
        { id: "d", name: "D", layoutFrom: "c" },
      ],
    });
    expect(settings.displays.map((d) => d.layoutFrom)).toEqual([
      undefined,
      undefined,
      undefined,
      "c",
    ]);
    expect(brokenLinks).toEqual(["A", "B", "C"]);
  });
});

describe("schema", () => {
  it("has no fields, so the server form keeps what the page saved", () => {
    expect("required" in schema).toBe(false);
    expect(schema.properties).toEqual({});
  });
});

describe("addressesMissing", () => {
  it("is false for a fresh install and for complete settings", () => {
    expect(addressesMissing({}, applyDefaults({}))).toBe(false);
    const raw = { displays: [{ id: "helm", name: "Helm" }] };
    expect(addressesMissing(raw, applyDefaults(raw))).toBe(false);
  });

  it("is true when an address was made up or an entry dropped", () => {
    const named = { displays: [{ name: "Salon" }] };
    expect(addressesMissing(named, applyDefaults(named))).toBe(true);
    const junk = { displays: [{ id: "helm" }, null] };
    expect(addressesMissing(junk, applyDefaults(junk))).toBe(true);
  });
});
