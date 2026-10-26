import { compile } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import remarkPolytypo from "../src/index.js";

describe("@mdx-js/mdx compile", () => {
  const source = `import X from "./x--y.js"

# Title -- "quoted"

<Callout title='say "hi" -- there'>
  Inside "callout" -- text...
</Callout>

<Callout>text "here"</Callout>

Outside "text" -- {props.name}
`;

  it("typesets prose, JSX children and leaves attributes and ESM alone", async () => {
    const file = await compile(source, {
      remarkPlugins: [[remarkPolytypo, { locale: "en-GB", dialect: "mdx" }]],
    });
    const code = String(file);
    expect(code).toContain("Title – ‘quoted’");
    expect(code).toContain("Inside ‘callout’ – text…");
    expect(code).toContain("text ‘here’");
    expect(code).toContain("Outside ‘text’ -- ");
    expect(code).toContain('say \\"hi\\" -- there');
    expect(code).toContain("./x--y.js");
    expect(file.messages).toEqual([]);
  });

  it("produces the same prose as the plugin-less compile of already typeset text", async () => {
    const typeset = String(
      await compile(source, {
        remarkPlugins: [[remarkPolytypo, { locale: "de-DE", dialect: "mdx" }]],
      }),
    );
    expect(typeset).toContain("Title – „quoted“");
  });

  it("reports an MDX parse failure from polytypo unchanged", async () => {
    await expect(
      compile("<Open>\n", {
        remarkPlugins: [[remarkPolytypo, { locale: "en-GB", dialect: "mdx" }]],
      }),
    ).rejects.toThrow();
  });
});

describe("remark-parse + remark-gfm + remark-stringify", () => {
  it("round-trips a document through the plugin", async () => {
    const out = await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkPolytypo, { locale: "fr", dialect: "commonmark" })
      .use(remarkStringify)
      .process(`Il a dit "bonjour" : oui...\n\n| a "b" |\n| - |\n| c -- d |\n`);
    expect(String(out)).toContain("«\u00a0bonjour\u00a0»");
    expect(String(out)).toContain("c — d");
  });
});
