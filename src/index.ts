import type { Root } from "mdast";
import { transform } from "polytypo";
import type { Dialect, Options } from "polytypo";
import type { Processor, Transformer } from "unified";

/**
 * Everything `polytypo` takes in `markdown` mode. `locale` and `dialect` are required and have no
 * default: the plugin never detects either. `mode`, `keys` and `protect` belong to other modes
 * and are not exposed.
 */
export interface RemarkPolytypoOptions extends Omit<
  Options,
  "mode" | "keys" | "protect" | "locale" | "dialect"
> {
  locale: string;
  dialect: Dialect;
}

interface Place {
  start: { offset?: number | undefined };
  end: { offset?: number | undefined };
}

type Position = NonNullable<Root["position"]>;
type File = Parameters<Transformer<Root>>[1];

interface AnyNode {
  type: string;
  children?: AnyNode[];
  position?: Place | undefined;
  [field: string]: unknown;
}

interface Edit {
  readonly node: AnyNode;
  readonly field: string;
  readonly to: string;
}

interface Scope {
  readonly node: AnyNode;
  readonly edits: Edit[];
  isTainted: boolean;
}

const ORIGIN = "remark-polytypo";
// Quote pairing and spacing reach across the blocks of a quotation, list or footnote, so these are
// carried or left unchanged as a whole.
const CONTAINERS: ReadonlySet<string> = new Set(["blockquote", "list", "footnoteDefinition"]);
const TEXT_BLOCKS: ReadonlySet<string> = new Set(["paragraph", "heading", "tableCell"]);
const IGNORED_FIELDS: ReadonlySet<string> = new Set(["children", "position", "data"]);

function proseField(type: string, hasFrontmatterKeys: boolean): string | undefined {
  if (type === "text") return "value";
  if (type === "image" || type === "imageReference") return "alt";
  if (type === "yaml" && hasFrontmatterKeys) return "value";
  return undefined;
}

function keyOf(node: AnyNode): string | undefined {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return undefined;
  return `${node.type}:${start}:${end}`;
}

function isSame(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (key === "position" || key === "data") continue;
    if (!isSame(left[key], right[key])) return false;
  }
  return true;
}

/**
 * Runs polytypo's `markdown` mode over the file's own source and carries the result into the
 * tree's prose fields (`text.value`, `image.alt`, `imageReference.alt`, and the frontmatter
 * `yaml.value` when `frontmatterKeys` is set). It must read the source, so it belongs first in
 * the plugin list: a plugin before it that changes the tree makes the affected nodes unmatchable,
 * and they are left as they are.
 */
export default function remarkPolytypo(
  this: Processor,
  options: RemarkPolytypoOptions,
): Transformer<Root> {
  const parse = this.parse.bind(this);
  const hasFrontmatterKeys = options.frontmatterKeys !== undefined;

  return function transformer(tree: Root, file: File): void {
    const source = String(file);
    if (source === "") {
      if (tree.children.length === 0) return;
      file.fail(
        "The file has no source text, and this plugin works on the source. Pass a VFile whose value is the Markdown the tree was parsed from.",
        { place: undefined, source: ORIGIN, ruleId: "no-source" },
      );
    }

    if (hasFrontmatterKeys && /^\uFEFF?---[ \t]*\r?\n/.test(source)) {
      if (!tree.children.some((child) => (child.type as string) === "yaml")) {
        file.message(
          "frontmatterKeys is set and the document starts with a frontmatter block, but the tree has no yaml node. Add remark-frontmatter before this plugin.",
          { source: ORIGIN, ruleId: "frontmatter-not-parsed" },
        );
      }
    }

    const output = transform(source, { ...options, mode: "markdown" });
    if (output === source) return;

    const before = parse(source) as unknown as AnyNode;
    let after: AnyNode;
    try {
      after = parse(output) as unknown as AnyNode;
    } catch (cause) {
      file.fail(
        new Error(
          "The typeset text does not parse with this processor's parser. The dialect option probably does not match the parser (for example `commonmark` for an MDX document).",
          { cause },
        ),
        undefined,
        `${ORIGIN}:reparse`,
      );
    }

    const scopes = new Map<AnyNode, Scope>();
    const scopeOf = (node: AnyNode): Scope => {
      let scope = scopes.get(node);
      if (!scope) {
        scope = { node, edits: [], isTainted: false };
        scopes.set(node, scope);
      }
      return scope;
    };
    const taint = (unit: AnyNode, at: AnyNode, why: string): void => {
      scopeOf(unit).isTainted = true;
      file.message(`${why}; the enclosing ${unit.type} was left unchanged.`, {
        place: at.position as Position | undefined,
        source: ORIGIN,
        ruleId: "left-unchanged",
      });
    };

    // The unit that is carried whole or not at all: the outermost blockquote, list or footnote
    // definition, otherwise the text block (paragraph, heading, table cell).
    const compare = (
      a: AnyNode,
      b: AnyNode,
      parent: AnyNode,
      block: AnyNode | undefined,
      container: AnyNode | undefined,
    ): void => {
      const childrenA = a.children;
      const childrenB = b.children;
      const here = TEXT_BLOCKS.has(a.type) ? a : block;
      const outer = container ?? (CONTAINERS.has(a.type) ? a : undefined);
      const unit = outer ?? here;
      if (
        a.type !== b.type ||
        (childrenA === undefined) !== (childrenB === undefined) ||
        (childrenA?.length ?? 0) !== (childrenB?.length ?? 0)
      ) {
        if (here === undefined || unit === undefined) {
          file.fail(
            `The document parses to a different tree after typography (${a.type} vs ${b.type}). The edit was not applied.`,
            { place: a.position as Position | undefined, source: ORIGIN, ruleId: "tree-shape" },
          );
        }
        taint(unit, a, `Typography would change how the text around a \`${a.type}\` node parses`);
        return;
      }
      const prose = proseField(a.type, hasFrontmatterKeys);
      const unsupported: string[] = [];
      for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (IGNORED_FIELDS.has(field) || isSame(a[field], b[field])) continue;
        const to = b[field];
        if (field === prose && typeof to === "string") {
          scopeOf(unit ?? parent).edits.push({ node: a, field, to });
        } else {
          unsupported.push(field);
        }
      }
      if (unsupported.length > 0) {
        // A literal whose delimiters are fixed (math, code, html, an expression) cannot move the
        // boundary of its neighbours. Anything else, such as a link whose URL would change, can.
        const isLiteral = childrenA === undefined && unsupported.join() === "value";
        if (unit !== undefined && !isLiteral) {
          taint(unit, a, `Typography would change a \`${a.type}\` node outside the prose fields`);
        } else {
          file.message(
            `Typography would change a \`${a.type}\` node outside the prose fields; that change was dropped.`,
            { place: a.position as Position | undefined, source: ORIGIN, ruleId: "dropped-change" },
          );
        }
      }
      if (childrenA && childrenB) {
        childrenA.forEach((child, index) =>
          compare(child, childrenB[index] as AnyNode, a, here, outer),
        );
      }
    };
    compare(before, after, before, undefined, undefined);

    const wanted = new Set<string>();
    for (const scope of scopes.values()) {
      if (scope.isTainted) continue;
      for (const edit of scope.edits) {
        const key = keyOf(edit.node);
        if (key !== undefined) wanted.add(key);
      }
    }

    const found = new Map<string, AnyNode[]>();
    const collect = (node: AnyNode): void => {
      const key = keyOf(node);
      if (key !== undefined && wanted.has(key)) {
        const list = found.get(key);
        if (list) list.push(node);
        else found.set(key, [node]);
      }
      node.children?.forEach(collect);
    };
    collect(tree as unknown as AnyNode);

    for (const scope of scopes.values()) {
      if (scope.isTainted || scope.edits.length === 0) continue;
      const writes: Array<() => void> = [];
      let isMatched = true;
      for (const edit of scope.edits) {
        const key = keyOf(edit.node);
        const nodes = key === undefined ? undefined : found.get(key);
        const target = nodes?.length === 1 ? nodes[0] : undefined;
        if (target === undefined || target[edit.field] !== edit.node[edit.field]) {
          isMatched = false;
          break;
        }
        writes.push(() => {
          target[edit.field] = edit.to;
        });
      }
      if (!isMatched) {
        file.message(
          `Typography was not applied to this ${scope.node.type}: its nodes no longer match the source, because an earlier plugin changed them or they carry no position.`,
          {
            place: scope.node.position as Position | undefined,
            source: ORIGIN,
            ruleId: "unmatched-edit",
          },
        );
        continue;
      }
      for (const write of writes) write();
    }
  };
}

export { remarkPolytypo };
