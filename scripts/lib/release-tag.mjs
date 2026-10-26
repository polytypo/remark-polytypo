// Release gate: the pushed tag must be exactly "v" plus the package.json version, and the
// placeholder version 0.0.0 is never published.
export const PLACEHOLDER_VERSION = "0.0.0";

/**
 * @param {string} tag - e.g. "v0.1.0", from `GITHUB_REF_NAME` on a tag-triggered workflow run.
 * @param {string} packageVersion - `package.json`'s "version" field.
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function verifyReleaseTag(tag, packageVersion) {
  if (packageVersion === PLACEHOLDER_VERSION) {
    return {
      ok: false,
      reason:
        `Refusing to publish version ${PLACEHOLDER_VERSION} — this is the intentionally ` +
        `unreleasable placeholder version. An operator must choose a real version first.`,
    };
  }
  const expectedTag = `v${packageVersion}`;
  if (tag !== expectedTag) {
    return {
      ok: false,
      reason: `Tag (${tag}) does not match package.json version (expected ${expectedTag}).`,
    };
  }
  return { ok: true };
}
