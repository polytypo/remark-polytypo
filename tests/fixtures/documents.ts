import type { Fixture } from "../helpers.js";

const body = `# Notes -- "quoted" title

She said "it's *really* fine" -- and then... nothing. He said, "She said 'go **now**' to me."

A paragraph with "a quote that opens
and closes on the next line" and 3-5 apples.

Escapes stay as written: \\"kept\\" and &quot;kept&quot; and &amp; -- done.

See [the "link" text](https://example.com/a--b "title -- with dashes") and
![an "image" -- alt](image--name.png) and <https://example.com/x--y>.

Inline \`code "with" quotes -- here\` and a fenced block:

\`\`\`js
const s = "not -- touched";
\`\`\`

    indented "code" -- stays in commonmark

- item "one" -- first
- item 'two' -- second

> quoted "text" -- inside a blockquote

| Column "a" | Column -- b |
| ---------- | ----------- |
| cell "x"   | cell -- y   |

Footnote ref[^1] and ~~struck "out"~~ text.

[^1]: The note says "hello" -- twice.

[ref]: https://example.com/ref--url "ref -- title"
`;

const html = `
<p>Raw "html" -- text</p>

<div class="a--b">Block "html" -- here</div>

Back to markdown "text" -- here.
`;

const frontmatter = (extra: string) => `---
title: "Plain -- title"
description: 'It''s a "quoted" description...'
slug: do-not-- touch
---

${extra}`;

const mdx = `import Thing from "./thing--name.js"
export const meta = { title: "keep -- this" }

# MDX -- "heading"

<Callout kind="a--b" title='say "hi" -- there'>
  Text "inside" a callout -- really...
</Callout>

<Callout>text "here"</Callout>

A paragraph with an {expression("not -- text")} inside, and "quotes" -- after.

<Tabs>
  <Tab label="One">

First "tab" -- content.

  </Tab>
</Tabs>
`;

export const documents: Fixture[] = [
  { name: "commonmark body", dialect: "commonmark", source: body },
  { name: "commonmark html", dialect: "commonmark", source: body + html },
  { name: "commonmark frontmatter skipped", dialect: "commonmark", source: frontmatter(body) },
  {
    name: "commonmark frontmatterKeys",
    dialect: "commonmark",
    source: frontmatter(body),
    frontmatterKeys: ["title", "description"],
  },
  {
    name: "mdx",
    dialect: "mdx",
    source: mdx,
  },
  {
    name: "mdx frontmatterKeys",
    dialect: "mdx",
    source: frontmatter(mdx),
    frontmatterKeys: ["title", "description"],
  },
];

export const locales = ["en-GB", "de-DE", "fr", "ru", "sl", "lt"];
