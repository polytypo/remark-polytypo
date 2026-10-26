import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parser, runPlugin, stringifyTree, texts } from "./helpers.js";
import type { Dialect } from "./helpers.js";

const words = ["alpha", "it's", "x", "don't", "2024", "e.g.", "100%", "a_b", "a*b"];
const atoms = fc.oneof(
  fc.constantFrom(...words),
  fc.constantFrom('"', "'", " -- ", " - ", "...", " : ", " ; ", "--", "(c)", "1-2"),
  fc.constantFrom("*emph*", "**strong**", "`code`", "[link](http://x.y/a--b)", "![im](i.png)"),
);
const paragraph = fc
  .array(atoms, { minLength: 1, maxLength: 14 })
  .map((parts) => parts.join(" ").replace(/ {2,}/g, " "));
const document = fc
  .array(paragraph, { minLength: 1, maxLength: 5 })
  .map((p) => p.join("\n\n") + "\n");

const locales = ["en-GB", "de-DE", "fr", "ru"];

async function once(source: string, dialect: Dialect, locale: string) {
  const { tree, file } = await runPlugin({ dialect, source }, locale);
  return { tree, markdown: stringifyTree(tree, dialect), messages: file.messages.length };
}

describe("fixed point: parse, plugin, stringify, parse, plugin", () => {
  for (const locale of locales) {
    it(`leaves the text values unchanged on the second pass (${locale})`, async () => {
      await fc.assert(
        fc.asyncProperty(document, async (source) => {
          const first = await once(source, "commonmark", locale);
          const second = await once(first.markdown, "commonmark", locale);
          expect(texts(second.tree)).toEqual(texts(parser("commonmark").parse(first.markdown)));
          expect(texts(second.tree)).toEqual(texts(first.tree));
        }),
        { numRuns: 300 },
      );
    });
  }
});

describe("a known counterexample", () => {
  // polytypo (fr) strips the space in `Q&A ;` and, once stringify has written the ampersand as
  // `\&`, inserts a narrow no-break space there on the next pass. A polytypo behaviour that
  // depends on the representation of the text, not on this plugin; measured on 1.16.0.
  it.fails("fr: `Q&A ;` is not a fixed point across stringify", async () => {
    const source = "Q&A ;\n";
    const first = await runPlugin({ dialect: "commonmark", source }, "fr");
    const typeset = stringifyTree(first.tree, "commonmark");
    const second = await runPlugin({ dialect: "commonmark", source: typeset }, "fr");
    expect(stringifyTree(second.tree, "commonmark")).toBe(typeset);
  });
});

describe("idempotence on the source", () => {
  it("running the plugin over its own typeset output changes nothing", async () => {
    await fc.assert(
      fc.asyncProperty(document, fc.constantFrom(...locales), async (source, locale) => {
        const first = await runPlugin({ dialect: "commonmark", source }, locale);
        const typeset = stringifyTree(first.tree, "commonmark");
        const second = await runPlugin({ dialect: "commonmark", source: typeset }, locale);
        expect(stringifyTree(second.tree, "commonmark")).toBe(typeset);
      }),
      { numRuns: 300 },
    );
  });
});
