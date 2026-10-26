import { describe, expect, it, vi } from "vitest";

vi.mock("polytypo", () => ({
  transform: (source: string) => `${source}\n\nAn extra paragraph.\n`,
}));

describe("a result that parses to a different tree", () => {
  it("fails with a positioned error and applies nothing", async () => {
    const { runPlugin } = await import("./helpers.js");
    await expect(
      runPlugin({ dialect: "commonmark", source: `A "quote"\n` }, "en-GB"),
    ).rejects.toMatchObject({
      source: "remark-polytypo",
      ruleId: "tree-shape",
      fatal: true,
    });
  });
});
