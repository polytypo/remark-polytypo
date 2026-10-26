import type { Root } from "mdast";
import remarkMath from "remark-math";
import remarkSmartypants from "remark-smartypants";
import { unified } from "unified";
import type { Plugin } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";
import remarkPolytypo from "../src/index.js";
import { parser, runPlugin, texts } from "./helpers.js";

describe("warnings", () => {
  it("math: discards the change and warns, converting the prose around it", async () => {
    const { tree, file } = await runPlugin(
      { dialect: "commonmark", source: `Before "x" and $a "b" -- c$ after "y".\n` },
      "en-GB",
      [remarkMath],
    );
    const flat = JSON.stringify(tree);
    expect(flat).toContain('"value":"a \\"b\\" -- c"');
    expect(flat).toContain("Before ‘x’ and ");
    expect(flat).toContain(" after ‘y’.");
    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]?.source).toBe("remark-polytypo");
    expect(file.messages[0]?.ruleId).toBe("skipped-edit");
    expect(file.messages[0]?.reason).toContain("inlineMath");
    expect(file.messages[0]?.place).toMatchObject({ start: { line: 1 } });
  });

  it("wrong dialect: an MDX document declared as commonmark warns for expressions", async () => {
    const source = `Text "here" and {/* a -- b */} end.\n`;
    const processor = parser("mdx").use(remarkPolytypo, { locale: "en-GB", dialect: "commonmark" });
    const file = new VFile(source);
    const tree = (await processor.run(processor.parse(file), file)) as Root;
    expect(JSON.stringify(tree)).toContain("/* a -- b */");
    expect(file.messages.map((m) => m.reason).join("\n")).toMatch(/mdxTextExpression/);
  });

  it("wrong dialect: typography that breaks the parse is an error that names the dialect", async () => {
    const processor = parser("mdx").use(remarkPolytypo, { locale: "en-GB", dialect: "commonmark" });
    const file = new VFile(`export const a = "x -- y"\n\nText.\n`);
    await expect(processor.run(processor.parse(file), file)).rejects.toThrow(/dialect/);
  });

  it("raw html nodes are not edited, and each says so", async () => {
    const { tree, file } = await runPlugin(
      { dialect: "commonmark", source: `<p>Raw "html" -- text</p>\n\nPlain "text" -- here\n` },
      "en-GB",
    );
    expect(JSON.stringify(tree)).toContain('<p>Raw \\"html\\" -- text</p>');
    expect(texts(tree)).toEqual(["text:Plain ‘text’ – here"]);
    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]?.reason).toContain("html");
  });

  it("polytypo's own errors pass through with their codes", async () => {
    await expect(
      runPlugin({ dialect: "commonmark", source: "a" }, "xx-nonexistent"),
    ).rejects.toMatchObject({ code: "POLYTYPO_UNKNOWN_LOCALE" });
    const processor = parser("commonmark").use(remarkPolytypo, { locale: "en-GB", dialect: "mdx" });
    const file = new VFile("An <https://example.com> autolink.\n");
    await expect(processor.run(processor.parse(file), file)).rejects.toMatchObject({
      code: "POLYTYPO_MALFORMED_INPUT",
    });
  });
});

describe("source handling", () => {
  it("accepts a file whose value is a Uint8Array", async () => {
    const processor = parser("commonmark").use(remarkPolytypo, {
      locale: "en-GB",
      dialect: "commonmark",
    });
    const file = new VFile(new TextEncoder().encode(`A "quote" -- here\n`));
    const tree = (await processor.run(processor.parse(file), file)) as Root;
    expect(texts(tree)).toEqual(["text:A ‘quote’ – here"]);
  });

  it("fails clearly when there is no source", async () => {
    const processor = parser("commonmark").use(remarkPolytypo, {
      locale: "en-GB",
      dialect: "commonmark",
    });
    const tree = processor.parse(`A "quote"\n`);
    await expect(processor.run(tree)).rejects.toThrow(/no source text/);
  });

  it("an empty document with no source is not an error", async () => {
    const processor = parser("commonmark").use(remarkPolytypo, {
      locale: "en-GB",
      dialect: "commonmark",
    });
    await expect(processor.run(processor.parse(""))).resolves.toBeDefined();
  });

  it("leaves the file value alone", async () => {
    const { file } = await runPlugin(
      { dialect: "commonmark", source: `A "quote" -- here\n` },
      "en-GB",
    );
    expect(String(file)).toBe(`A "quote" -- here\n`);
  });
});

describe("matching nodes by position", () => {
  const uppercase: Plugin<[], Root> = () => (tree) => {
    const visit = (node: { type: string; value?: string; children?: unknown[] }): void => {
      if (node.type === "text" && node.value?.includes("EDIT"))
        node.value = node.value.toUpperCase();
      node.children?.forEach((child) => visit(child as typeof node));
    };
    visit(tree);
  };

  it("leaves nodes an earlier plugin changed untouched and converts the rest", async () => {
    const { tree, file } = await runPlugin(
      { dialect: "commonmark", source: `First "one" -- EDIT me\n\nSecond "two" -- here\n` },
      "en-GB",
      [uppercase],
    );
    expect(texts(tree)).toEqual(['text:FIRST "ONE" -- EDIT ME', "text:Second ‘two’ – here"]);
    expect(file.messages.map((m) => m.ruleId)).toEqual(["unmatched-edit"]);
    expect(file.messages[0]?.place).toMatchObject({ start: { line: 1 } });
  });

  it("leaves nodes without a position untouched", async () => {
    const strip: Plugin<[], Root> = () => (tree) => {
      const visit = (node: { position?: unknown; children?: unknown[] }): void => {
        delete node.position;
        node.children?.forEach((child) => visit(child as typeof node));
      };
      visit(tree);
    };
    const { tree } = await runPlugin(
      { dialect: "commonmark", source: `A "quote" -- here\n` },
      "en-GB",
      [strip],
    );
    expect(texts(tree)).toEqual([`text:A "quote" -- here`]);
  });

  it("a node appended by an earlier plugin is not touched", async () => {
    const append: Plugin<[], Root> = () => (tree) => {
      tree.children.push({
        type: "paragraph",
        children: [{ type: "text", value: 'Added "x" -- y' }],
      });
    };
    const { tree } = await runPlugin(
      { dialect: "commonmark", source: `A "quote" -- here\n` },
      "en-GB",
      [append],
    );
    expect(texts(tree)).toEqual(["text:A ‘quote’ – here", 'text:Added "x" -- y']);
  });

  it("works when the processor is reused across files", async () => {
    const processor = unified()
      .use((await import("remark-parse")).default)
      .use(remarkPolytypo, { locale: "en-GB", dialect: "commonmark" });
    for (const source of [`A "one" -- x\n`, `B "two" -- y\n`]) {
      const file = new VFile(source);
      const tree = (await processor.run(processor.parse(file), file)) as Root;
      expect(texts(tree)[0]).toMatch(/‘/);
    }
  });
});

describe("text blocks are carried whole or not at all", () => {
  it("a closing quote that a GFM autolink literal would swallow leaves the block unchanged", async () => {
    const source = `Monitor "Uptime for https://example.com" now.\n\nOther "text" -- here.\n`;
    const { tree, file } = await runPlugin({ dialect: "commonmark", source }, "en-GB");
    expect(texts(tree)).toEqual([
      'text:Monitor "Uptime for ',
      "text:https://example.com",
      'text:" now.',
      "text:Other ‘text’ – here.",
    ]);
    expect(JSON.stringify(tree)).toContain('"url":"https://example.com"');
    expect(file.messages.map((m) => m.ruleId)).toEqual(["skipped-edit"]);
  });

  it("a block holding a www literal (no positions) is left unchanged and says so", async () => {
    // remark-gfm gives the nodes of a paragraph that ends in a bare "www." no position at all.
    const source = `Visit "details" -- now www.\n\nOther "text" -- here.\n`;
    const { tree, file } = await runPlugin({ dialect: "commonmark", source }, "en-GB");
    expect(texts(tree).at(-1)).toBe("text:Other ‘text’ – here.");
    expect(texts(tree).join("")).toContain('"details" -- now ');
    expect(file.messages.map((m) => m.ruleId)).toEqual(["unmatched-edit"]);
  });
});

describe("plugin order", () => {
  const source = `She said "it's fine" -- really...\n\nOther "text" here.\n`;

  it("first: converts everything and reports nothing", async () => {
    const processor = parser("commonmark")
      .use(remarkPolytypo, { locale: "en-GB", dialect: "commonmark" })
      .use(remarkSmartypants);
    const file = new VFile(source);
    const tree = (await processor.run(processor.parse(file), file)) as Root;
    expect(texts(tree)[0]).toBe("text:She said ‘it’s fine’ – really…");
    expect(file.messages).toEqual([]);
  });

  it("after remark-smartypants: leaves that text as smartypants made it and says so", async () => {
    const processor = parser("commonmark")
      .use(remarkSmartypants)
      .use(remarkPolytypo, { locale: "en-GB", dialect: "commonmark" });
    const file = new VFile(source);
    const tree = (await processor.run(processor.parse(file), file)) as Root;
    expect(texts(tree)[0]).toContain("“it’s fine”");
    expect(file.messages.map((m) => m.ruleId)).toEqual(["unmatched-edit", "unmatched-edit"]);
  });
});
