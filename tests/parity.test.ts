import { describe, expect, it } from "vitest";
import { documents, locales } from "./fixtures/documents.js";
import { expectedTexts, runPlugin, texts } from "./helpers.js";

describe("parity with polytypo's markdown mode", () => {
  const clean = documents.filter((fixture) => fixture.name !== "commonmark html");

  for (const fixture of clean) {
    for (const locale of locales) {
      it(`${fixture.name} / ${locale}`, async () => {
        const { tree, file } = await runPlugin(fixture, locale);
        expect(file.messages.map(String)).toEqual([]);
        expect(texts(tree)).toEqual(expectedTexts(fixture, locale));
      });
    }
  }

  it("changes something in every locale, so the comparison is not vacuous", async () => {
    for (const locale of locales) {
      const fixture = clean[0]!;
      const { tree } = await runPlugin(fixture, locale);
      expect(texts(tree)).not.toEqual(
        texts((await runPlugin({ ...fixture, source: "" }, locale)).tree),
      );
    }
  });
});

describe("literal expectations", () => {
  it("en-GB: single quotes outside, double inside, dashes and ellipsis", async () => {
    const { tree } = await runPlugin(
      { dialect: "commonmark", source: `He said, "She said 'go **now**' to me" -- wait...\n` },
      "en-GB",
    );
    expect(texts(tree)).toEqual([
      "text:He said, ‘She said “go ",
      "text:now",
      "text:” to me’ – wait…",
    ]);
  });

  it("de-DE: German quotes across emphasis", async () => {
    const { tree } = await runPlugin(
      { dialect: "commonmark", source: `Sie sagte "es ist *gut*" -- sicher.\n` },
      "de-DE",
    );
    expect(texts(tree)).toEqual(["text:Sie sagte „es ist ", "text:gut", "text:“ – sicher."]);
  });

  it("leaves escapes and character references exactly where markdown mode leaves them", async () => {
    const { tree } = await runPlugin(
      { dialect: "commonmark", source: `\\"kept\\" and &quot;kept&quot; and "changed"\n` },
      "en-GB",
    );
    expect(texts(tree)).toEqual([`text:"kept" and "kept" and ‘changed’`]);
  });

  it("converts image alt text and link text but not destinations or titles", async () => {
    const { tree } = await runPlugin(
      {
        dialect: "commonmark",
        source: `![an "image" -- alt](a--b.png "t -- t") [the "link"](https://x.y/a--b "t -- t")\n`,
      },
      "en-GB",
    );
    const flat = JSON.stringify(tree);
    expect(flat).toContain("an ‘image’ – alt");
    expect(flat).toContain("the ‘link’");
    expect(flat).toContain("a--b.png");
    expect(flat).toContain("https://x.y/a--b");
    expect(flat).toContain("t -- t");
  });

  it("inline code and fenced code are untouched", async () => {
    const { tree } = await runPlugin(
      { dialect: "commonmark", source: '`a -- "b"`\n\n```\nx -- "y"\n```\n' },
      "en-GB",
    );
    expect(JSON.stringify(tree)).toContain('a -- \\"b\\"');
    expect(JSON.stringify(tree)).toContain('x -- \\"y\\"');
  });

  it("frontmatterKeys converts the listed keys only", async () => {
    const { tree } = await runPlugin(
      {
        dialect: "commonmark",
        source: `---\ntitle: "A -- b"\nslug: a--b\n---\n\nbody\n`,
        frontmatterKeys: ["title"],
      },
      "en-GB",
    );
    expect(texts(tree)[0]).toBe(`yaml:title: "A – b"\nslug: a--b`);
  });

  it("frontmatter is left alone without frontmatterKeys", async () => {
    const { tree } = await runPlugin(
      { dialect: "commonmark", source: `---\ntitle: "A -- b"\n---\n\nbody\n` },
      "en-GB",
    );
    expect(texts(tree)[0]).toBe(`yaml:title: "A -- b"`);
  });
});
