# acme-dashboard-nextjs

The Next.js arm of a measured AI-agent framework comparison: the same
dashboard product, evolved feature-by-feature by fresh AI agent
sessions from identical framework-neutral task statements, measured at
every step. This repo is the evidence — every round is inspectable at
the exact commits it was measured at.

Live app: https://acme-dashboard-nextjs-private.vercel.app · demo
login `user@nextmail.com` / `123456`

## Provenance

Derived from Vercel's [Next.js Learn](https://nextjs.org/learn)
course dashboard, evolved by AI agents as part of a measured
comparison. Running Next.js 16.3 with the full first-party agent
apparatus the framework ships (AGENTS.md, bundled version-matched
docs, first-party Skills) — each arm ran its own framework's best
practice, which is what makes the comparison worth reading.

## The tag structure

Every scored round carries a `pre-<round>` and `post-<round>` tag, so
`git diff pre-B3..post-B3` shows exactly what the agent built for
that round:

| Round | Feature |
|---|---|
| B1 | Column sorting, URL-persisted |
| B2 | Inline status toggle + app-wide freshness guarantee |
| B3 | Global Cmd-K quick-search |
| B4 | Scale (5,000 invoices) + loading feedback |
| B5 | Real-time payments (SSE live feed) |
| P1 | Customers pagination (polish round, protocol-run, unscored) |
| P2-1 | Spreadsheet-grade bulk editing under live events |

## Metrics and protocol

The task statements, acceptance criteria, seed fixtures, and counting
rules are published as a framework-neutral kit:
[benchmark-protocol](https://github.com/relevantcontext/benchmark-protocol).
Per-round metrics were counted from agent transcripts, never
self-reports.

- Article: forthcoming.
- Sibling arm: [acme-dashboard-spynejs](https://github.com/relevantcontext/acme-dashboard-spynejs)
- [relevantcontext.io](https://relevantcontext.io)

## License

MIT — see [LICENSE](LICENSE). Based on Vercel's Next.js Learn course
template (MIT); attribution retained there.
