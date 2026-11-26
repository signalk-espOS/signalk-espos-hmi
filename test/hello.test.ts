import { describe, expect, it } from "vitest";

import { buildHello, WIDGET_CATALOG } from "../src/hello.js";

describe("buildHello", () => {
  const hello = buildHello(
    { id: "helm", name: "Helm", resolution: "1280x800", readOnly: true },
    "0.1.0",
    "Mine",
    "stored",
  );

  it("describes the display like a panel's /hello", () => {
    expect(hello.schema).toBe(1);
    expect(hello.display).toMatchObject({ w: 1280, h: 800 });
    expect(hello.read_only).toBe(true);
    expect(hello.layout_source).toBe("stored");
  });

  it("ends the firmware string with the version", () => {
    expect(hello.firmware).toMatch(/0\.1\.0$/);
  });

  it("offers no kind that needs a panel's hardware", () => {
    for (const kind of ["voice", "speaker", "mic", "volume", "stream"]) {
      expect(WIDGET_CATALOG).not.toHaveProperty(kind);
    }
  });
});
