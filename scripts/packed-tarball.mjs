#!/usr/bin/env node
// Installs the packed tarball into a temporary consumer project outside this checkout and runs
// it from there, as a user would: ESM import, a real unified pipeline, and a TypeScript
// consumer resolving the shipped declarations. `--tarball <path>` tests an existing tarball
// (the release job passes the one it is about to publish); without it, one is packed first.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

const flag = process.argv.indexOf("--tarball");
const work = mkdtempSync(path.join(tmpdir(), "remark-polytypo-pack-"));
let tarball;
if (flag !== -1) {
  tarball = path.resolve(process.argv[flag + 1]);
} else {
  const out = run("pnpm", ["pack", "--pack-destination", work, "--json"], root);
  tarball = JSON.parse(out.slice(out.indexOf("\n{") + 1)).filename;
}
console.log(`tarball: ${tarball}`);

const listing = run("tar", ["-tzf", tarball], root)
  .split("\n")
  .filter(Boolean)
  .map((entry) => entry.replace(/^package\//, ""));
const unexpected = listing.filter(
  (entry) =>
    !(entry === "package.json" || entry === "README.md" || entry === "LICENSE") &&
    !entry.startsWith("dist/"),
);
if (unexpected.length > 0) throw new Error(`unexpected files in the tarball: ${unexpected}`);
for (const required of [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/index.js",
  "dist/index.d.ts",
]) {
  if (!listing.includes(required)) throw new Error(`missing from the tarball: ${required}`);
}

const consumer = path.join(work, "consumer");
mkdirSync(consumer);
writeFileSync(
  path.join(consumer, "package.json"),
  JSON.stringify({ name: "consumer", private: true, type: "module" }),
);
run(
  "npm",
  [
    "install",
    "--no-audit",
    "--no-fund",
    tarball,
    "unified@11",
    "remark-parse@11",
    "remark-stringify@11",
  ],
  consumer,
);

writeFileSync(
  path.join(consumer, "run.mjs"),
  `import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkPolytypo, { remarkPolytypo as named } from "remark-polytypo";

if (named !== remarkPolytypo) throw new Error("named and default exports differ");
const file = await unified()
  .use(remarkParse)
  .use(remarkPolytypo, { locale: "de-DE", dialect: "commonmark" })
  .use(remarkStringify)
  .process('Sie sagte "es ist *gut*" -- sicher...\\n');
const expected = "Sie sagte „es ist *gut*“ – sicher…\\n";
if (String(file) !== expected) throw new Error(JSON.stringify(String(file)) + " !== " + JSON.stringify(expected));
console.log("ESM run: ok");
`,
);
console.log(run("node", ["run.mjs"], consumer).trim());

writeFileSync(
  path.join(consumer, "check.mts"),
  `import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkPolytypo from "remark-polytypo";
import type { RemarkPolytypoOptions } from "remark-polytypo";

const options: RemarkPolytypoOptions = { locale: "en-GB", dialect: "mdx", frontmatterKeys: ["title"] };
unified().use(remarkParse).use(remarkPolytypo, options);

// @ts-expect-error dialect is required
unified().use(remarkParse).use(remarkPolytypo, { locale: "en-GB" });
// @ts-expect-error mode is not an option
unified().use(remarkParse).use(remarkPolytypo, { locale: "en-GB", dialect: "mdx", mode: "text" });
`,
);
writeFileSync(
  path.join(consumer, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      module: "nodenext",
      moduleResolution: "nodenext",
      target: "ES2022",
      strict: true,
      noEmit: true,
      types: [],
    },
    files: ["check.mts"],
  }),
);
run("node", [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "."], consumer);
console.log("TypeScript consumer: ok");

console.log(JSON.stringify({ tarball, files: listing }, null, 2));
