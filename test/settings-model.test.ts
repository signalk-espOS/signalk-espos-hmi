import { describe, expect, it } from "vitest";

import {
  addDisplay,
  followersOf,
  fromServer,
  layoutChoices,
  removeDisplay,
  setLayoutFrom,
  toServer,
  type EditDisplay,
} from "../webapp/src/settings-model.js";

const d = (id: string, layoutFrom = ""): EditDisplay => ({
  id,
  name: id.toUpperCase(),
  resolution: "1920x1080",
  readOnly: false,
  layoutFrom,
});

describe("layoutChoices", () => {
  it("offers an own layout and every other saved display with its own", () => {
    const list = [d("fly"), d("helm"), d("salon", "fly"), d("")];
    expect(layoutChoices(list, 1)).toEqual([
      { value: "", label: "Own layout" },
      { value: "fly", label: "FLY" },
    ]);
  });
});

describe("setLayoutFrom", () => {
  it("moves the followers of a new follower along to its source", () => {
    const list = setLayoutFrom(
      [d("fly"), d("helm"), d("salon", "helm")],
      1,
      "fly",
    );
    expect(list.map((x) => x.layoutFrom)).toEqual(["", "fly", "fly"]);
  });

  it("gives a follower that becomes the source its own layout", () => {
    const list = setLayoutFrom([d("helm"), d("salon", "helm")], 0, "salon");
    expect(list.map((x) => x.layoutFrom)).toEqual(["salon", ""]);
  });

  it("leaves the others alone when a display takes its own layout", () => {
    const list = setLayoutFrom([d("helm"), d("salon", "helm")], 1, "");
    expect(list.map((x) => x.layoutFrom)).toEqual(["", ""]);
  });
});

describe("followersOf and removeDisplay", () => {
  it("names the followers and frees them when their source goes", () => {
    const list = [d("helm"), d("salon", "helm"), d("fly", "helm")];
    expect(followersOf(list, 0)).toEqual(["SALON", "FLY"]);
    expect(removeDisplay(list, 0).map((x) => [x.id, x.layoutFrom])).toEqual([
      ["salon", ""],
      ["fly", ""],
    ]);
  });
});

describe("server shape", () => {
  it("reads what the server sends and sends back only what is set", () => {
    const list = fromServer({
      displays: [
        { id: "helm", name: "Helm", resolution: "1920x1080", readOnly: true },
        {
          id: "salon",
          name: "Salon",
          resolution: "1280x800",
          layoutFrom: "helm",
        },
      ],
    });
    const added = addDisplay(list, "800x480");
    expect(toServer(added)).toEqual({
      displays: [
        { id: "helm", name: "Helm", resolution: "1920x1080", readOnly: true },
        {
          id: "salon",
          name: "Salon",
          resolution: "1280x800",
          readOnly: false,
          layoutFrom: "helm",
        },
        { name: "Display 3", resolution: "800x480", readOnly: false },
      ],
    });
    expect(fromServer(null)).toEqual([]);
  });
});
