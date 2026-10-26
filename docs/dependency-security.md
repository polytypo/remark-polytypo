# Dependency security

Canonical rules: the dependency-upgrades playbook. This file records only what deviates from it.

## Deviations from the matrix

| Item           | Deviation                                            | Reason                                                                                                                                                   | Date       |
| -------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `engines.node` | `>=20`, no upper bound (matrix: `>=24 <25`)          | Operator decision: a library must install wherever unified 11 and polytypo run. Node 20 is past end of life per the matrix table, and CI still tests it. | 2026-10-26 |
| `vitest`       | Held at `^4.1.12` (matrix: 4.x, 5.x from 2026-10-03) | Vitest 5 requires Node 22.12 or newer; the Node 20 test job runs the suite on Node 20. Renovate `allowedVersions: "<5"`.                                 | 2026-10-26 |
| `@types/node`  | `^24`                                                | Types follow the CI runtime major, not the `engines` floor; the library source uses no Node API.                                                         | 2026-10-26 |
| `unified`      | Peer `^11.0.0`, dev `^11.0.5`                        | Peer range is the supported line; dev pins the tested release.                                                                                           | 2026-10-26 |

## Accepted advisories (`audit.ignore`)

None.

## Overrides, `allowBuilds: true`, peer exceptions

- `minimumReleaseAgeExclude: [polytypo@1.16.0]`: the only release inside `^1.16.0` was published
  2026-10-25. Remove the entry after 2026-10-28.

## Upgrade log
