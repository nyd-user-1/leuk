# Leuk — session onboarding (evergreen)

You are one of several Claude sessions working this repo, usually in parallel. Read this once, then do the task you were given. `CLAUDE.md` (auto-loaded) is binding — this file adds the operational context it doesn't cover.

## Orient (do these, cheaply, before coding)
1. `git log --oneline -10` and `git status --short` — learn what recently shipped and, critically, **what other sessions have uncommitted in the shared tree. Never stage, commit, revert, or edit files you didn't change** (staging is always explicit file lists; `git add -A` is forbidden).
2. The dev server runs at `http://localhost:3010` against **live Neon** (`.env.local`) — data persists; delete any test rows you create. Logins: `brendan@leuk.demo` (practitioner) / `casey@leuk.demo` (client), password `demo`.
3. UI work? Open `/design-system` (signed in) — the live gallery of all ~44 primitives and ~30 feature components. **Hover any card to copy its exact import line**; the "Copy manifest" button (if present) copies the full inventory. Compose these; creating a new component requires saying so explicitly in your report.

## Standing rules not to re-derive
- **One H1 per page, in the TopBar** — route-derived via `ROUTE_TITLES` in `components/shell/topbar.tsx`; page primary actions go through `TopBarActions` (`components/shell/topbar-slot.tsx`). Never render a page-level H1 in content (entity headers on detail pages and full-screen surfaces are the exceptions).
- Teal border = focus/active (and copyable-card hover on /design-system) ONLY; everything else hovers with the muted `bg-canvas` grey. Amber is accent, used sparingly.
- Data goes through `lib/repos/*` (dual-mode: `hasDb ? sql : mockStore()`; dates normalized to ISO strings — never pass driver `Date` objects to the UI). API routes: `requireUser()`/`requireRole()` + AuthError pattern + `logEvent` on PHI writes.
- Brendan watches the dev server live. **No subagents/workflows — usage is metered; work inline and token-lean.** Follow instruction geometry exactly (if he says "put X in front of Y," that is left of Y, same side, same row).

## Verify, then report
- `npx tsc --noEmit` clean; exercise your surface in the running app. For visual changes, check with headless Chrome (playwright-core is a devDep; `channel: "chrome"`) **before** claiming done — but don't send screenshots to Brendan.
- Commit per coherent unit, explicit staging, message style + `Co-Authored-By` / `Claude-Session` trailers copied from `git log -2`. Push unless told otherwise.
- Report tersely: what changed, what you verified, any deviation from the ask and why, anything left for others.
