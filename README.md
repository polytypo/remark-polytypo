# remark-polytypo

[![npm version](https://img.shields.io/npm/v/remark-polytypo.svg)](https://www.npmjs.com/package/remark-polytypo)
[![CI](https://github.com/polytypo/remark-polytypo/actions/workflows/ci.yml/badge.svg)](https://github.com/polytypo/remark-polytypo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/remark-polytypo.svg)](LICENSE)

A [remark](https://github.com/remarkjs/remark) plugin that applies [polytypo](https://polytypo.dev/)
to the prose of a Markdown or MDX document: locale-correct quotes, dashes, ellipses, apostrophes and
no-break spaces. Code, URLs, MDX expressions, JSX attributes and ESM are not touched.

## Install

```sh
npm install remark-polytypo
```

ESM only. Requires Node.js 20 or newer and `unified` 11 (remark 15).

## Use

```js
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkPolytypo from "remark-polytypo";

const file = await unified()
  .use(remarkParse)
  .use(remarkPolytypo, { locale: "de-DE", dialect: "commonmark" })
  .use(remarkStringify)
  .process('Sie sagte "es ist *gut*" -- sicher...');

String(file);
// Sie sagte „es ist *gut*“ – sicher…
```

### MDX

```js
import { compile } from "@mdx-js/mdx";
import remarkPolytypo from "remark-polytypo";

await compile(source, {
  remarkPlugins: [[remarkPolytypo, { locale: "en-GB", dialect: "mdx" }]],
});
```

### Astro

`@astrojs/mdx` extends your project's `markdown` configuration by default (`extendMarkdownConfig`
is `true`), so a plugin configured for Markdown also runs on `.mdx` files, with the dialect you gave
it. `.md` and `.mdx` need different dialects, so give the MDX integration its own list:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import remarkPolytypo from "remark-polytypo";

export default defineConfig({
  integrations: [
    mdx({
      extendMarkdownConfig: false,
      remarkPlugins: [[remarkPolytypo, { locale: "en-GB", dialect: "mdx" }]],
    }),
  ],
});
```

Astro's `markdown.smartypants` option defaults to `true`. SmartyPants converts the same quotes and
dashes this plugin does, and text that another plugin has already changed is left as it is (see
below), so turn `smartypants` off when you use this plugin.

### Next.js (`@next/mdx`)

With Turbopack, plugins are passed by name and their options must be serializable, which they are:

```js
// next.config.mjs
import createMDX from "@next/mdx";

const withMDX = createMDX({
  options: {
    remarkPlugins: [["remark-polytypo", { locale: "en-GB", dialect: "mdx" }]],
  },
});

export default withMDX({ pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"] });
```

## Options

`locale` and `dialect` are required. There is no default for either and nothing is detected.

| Option            | Type                               | Description                                                                                                                        |
| ----------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `locale`          | `string`                           | A polytypo locale id such as `en-GB`, `de-DE`, `fr`, `ru`. An unknown locale throws.                                               |
| `dialect`         | `"commonmark"` or `"mdx"`          | How polytypo reads the document. Use `mdx` for `.mdx` files and `commonmark` (CommonMark plus GFM) for `.md`.                      |
| `rules`           | `Partial<Record<RuleId, boolean>>` | Turns single rules on or off. `ranges` is off by default.                                                                          |
| `narrowNbsp`      | `"narrow"` or `"nbsp"`             | Emit U+00A0 instead of U+202F where a rule would insert the narrow no-break space.                                                 |
| `frontmatterKeys` | `string[]`                         | YAML frontmatter keys whose values are prose. Without it the frontmatter is left alone. It needs `remark-frontmatter` (see below). |

The options are polytypo's own, validated by polytypo; a `PolytypoError` and its code reach you
unchanged. The `mode`, `keys` and `protect` options do not exist here. Values are static: there is
no function form.

## How it works

The plugin reads the file's source text, runs polytypo's `markdown` mode over it, and parses the
source and the result with the processor's own parser. It copies the differences into the tree you
are already working with: `text` values, `image` and `imageReference` `alt` text, and the
frontmatter `yaml` value when `frontmatterKeys` is set. Nothing else in the tree changes, and
`file.value` is not modified.

Changes are matched to nodes by their source position, and a node is only changed if its value is
still the one the parser produced. So:

- **Put the plugin first.** It needs the source and an unmodified tree. If an earlier plugin
  rewrites text (smart quotes, for example), that text is no longer matched.
- **Frontmatter** is a `yaml` node only when `remark-frontmatter` is in the pipeline. Without it the
  frontmatter is parsed as Markdown and `frontmatterKeys` has no useful meaning.

## Warnings and errors

Anything the plugin cannot apply safely is left as it was, and a message is added to `file.messages`
(source `remark-polytypo`):

| `ruleId`         | Meaning                                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skipped-edit`   | polytypo changed text that lives in a node other than prose, for example raw HTML, `inlineMath` (remark-math) or an MDX expression. That change is dropped.                              |
| `unmatched-edit` | A paragraph, heading or table cell whose nodes no longer match the source (an earlier plugin changed them, or the parser gave them no position). The whole text block is left unchanged. |

When the change would alter the boundary of a neighbouring node, such as a link whose address would
end differently, the paragraph, heading or table cell around it is left unchanged as a whole, so a
quotation is never half converted.

These cases stop the build with an error:

- `no-source`: the file has no source text (for example `processor.run(tree)` without a file).
- `tree-shape`: the document parses to a different tree after typography.
- `reparse`: the typeset text does not parse with the processor's parser, which usually means
  `dialect` does not match the parser (`commonmark` for an MDX document, for instance).
- A `PolytypoError` from polytypo, such as `POLYTYPO_UNKNOWN_LOCALE` or, for an MDX document that
  does not parse, `POLYTYPO_MALFORMED_INPUT`.

## Documentation

How each rule works, the locale list and the playground are at [polytypo.dev](https://polytypo.dev/).
The engine is [polytypo](https://www.npmjs.com/package/polytypo).

## License

MIT
