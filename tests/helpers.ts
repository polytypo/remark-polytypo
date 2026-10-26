import { transform } from "polytypo";
import type { Root } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import type { Pluggable } from "unified";
import { VFile } from "vfile";
import remarkPolytypo from "../src/index.js";
import type { RemarkPolytypoOptions } from "../src/index.js";

export type Dialect = "commonmark" | "mdx";

export interface Fixture {
  name: string;
  dialect: Dialect;
  source: string;
  frontmatterKeys?: string[];
}

export function parser(dialect: Dialect, extra: Pluggable[] = []) {
  const processor = unified().use(remarkParse);
  if (dialect === "mdx") processor.use(remarkMdx);
  processor.use(remarkFrontmatter, ["yaml"]).use(remarkGfm);
  processor.use(extra);
  return processor;
}

export function texts(node: unknown, out: string[] = []): string[] {
  const n = node as { type: string; value?: string; alt?: string | null; children?: unknown[] };
  if (n.type === "text" || n.type === "yaml") out.push(`${n.type}:${n.value ?? ""}`);
  if (typeof n.alt === "string") out.push(`${n.type}.alt:${n.alt}`);
  n.children?.forEach((child) => texts(child, out));
  return out;
}

export function optionsFor(
  fixture: Pick<Fixture, "dialect" | "frontmatterKeys">,
  locale: string,
): RemarkPolytypoOptions {
  return {
    locale,
    dialect: fixture.dialect,
    ...(fixture.frontmatterKeys ? { frontmatterKeys: fixture.frontmatterKeys } : {}),
  };
}

export async function runPlugin(
  fixture: Pick<Fixture, "dialect" | "source" | "frontmatterKeys">,
  locale: string,
  extra: Pluggable[] = [],
) {
  const processor = parser(fixture.dialect, extra).use(remarkPolytypo, optionsFor(fixture, locale));
  const file = new VFile(fixture.source);
  const tree = (await processor.run(processor.parse(file), file)) as Root;
  return { tree, file, processor };
}

export function expectedTexts(
  fixture: Pick<Fixture, "dialect" | "source" | "frontmatterKeys">,
  locale: string,
): string[] {
  const out = transform(fixture.source, { ...optionsFor(fixture, locale), mode: "markdown" });
  return texts(parser(fixture.dialect).parse(out));
}

export function stringifyTree(tree: Root, dialect: Dialect): string {
  const processor = unified().use(remarkStringify);
  if (dialect === "mdx") processor.use(remarkMdx);
  processor.use(remarkFrontmatter, ["yaml"]).use(remarkGfm);
  return processor.stringify(tree);
}
