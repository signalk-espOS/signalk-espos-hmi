import { describe, expect, it } from "vitest";

import { fitBox, toDisplay } from "../webapp/src/fit.js";

describe("fitBox", () => {
  it("draws pixel for pixel when the window is the display's size", () => {
    expect(fitBox(1920, 1080, 1920, 1080)).toEqual({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      scale: 1,
    });
  });

  it("letterboxes a wider window and centres the display", () => {
    const b = fitBox(1024, 600, 2048, 600);
    expect(b).toMatchObject({ left: 512, top: 0, width: 1024, height: 600 });
  });
});

describe("toDisplay", () => {
  const box = fitBox(1024, 600, 512, 400);

  it("maps a touch into display pixels", () => {
    expect(toDisplay(box, 1024, 600, box.left + 256, box.top + 150)).toEqual({
      x: 512,
      y: 300,
    });
  });

  it("returns null outside the display", () => {
    expect(toDisplay(box, 1024, 600, 0, 0)).toBeNull();
  });
});
