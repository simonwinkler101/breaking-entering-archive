# Breaking and Entering Archive — project guidance

Canonical shared instructions for AI coding agents (Claude Code, Codex, etc.)
working in this repository.

## Project purpose

- This is the Breaking and Entering archive for Lauren Taylor and Simon
  Winkler's Triple R program.
- It is a calm, library-like public archive of interviews, guest mixes, live
  sessions and selected special programs.
- Preservation source files remain separate from public website derivatives.

## Technical architecture

- Vite 8, React 19, TypeScript 5.9, npm.
- Node 22 or later.
- Netlify production deployment (`npm run build` → `dist/`).
- Decap CMS at `/admin/` (GitHub backend, `publish_mode: editorial_workflow`).
  Saving a draft creates a branch and pull request behind the interface;
  Publish merges it once the required `build` check passes. See
  `docs/cms-editing-guide.md`. Never weaken `main` protection (PR requirement,
  required `build` check, admin enforcement, force-push and deletion blocks)
  to make CMS publishing work.
- Use the repository's existing Node/TypeScript environment unless another
  runtime is explicitly approved.

## Content architecture

- `content/archive/*.json` — the public archive entry sources, one per entry.
- `content/archive-associations.json` — curated relationships.
- `content/private/broadcast-archive.json` — preserved broadcasts, excluded
  from the website and search. Not confidential (the GitHub repository is
  public), but never emitted into public website, search, permanent-page or
  sitemap artifacts. Build validation may legitimately read the source file.
- `content/archive-research.json` — canonical non-derived research material
  (`researchSnapshot`, `scopeNote`, `recoveryLeads`, `sourceHubs`).
- `data/` — generated outputs only, untracked and gitignored. It is rebuilt
  from canonical `content/` sources by `npm run content:build` (which
  `npm run build` and `npm run dev` run automatically). Never hand-edit or
  commit `data/`; edit the canonical sources instead.
- Broadcast entries must never enter public archive content, search, permanent
  pages or the sitemap.

## Build and verification

- Use `npm ci` for a clean dependency installation.
- Run `npm run build` before committing website or content changes.
- The build must validate public entries, compile TypeScript, build Vite,
  generate the permanent `/archive/<id>/` pages and create the sitemap.
- The GitHub `build` check is required on `main`.
- Stop conditions — halt and report rather than proceeding: unexpected mass
  deletion, a missing `src/main.tsx`, an empty archive, or a page-count
  mismatch.
- Generated data: `data/` is untracked build output, regenerated from
  canonical `content/` sources on every build. Halt only if a build loses
  non-derivable research fields or produces unexpected mass changes.

## Git safety

- `main` is protected; every change arrives via a working branch and pull
  request. Never push directly to `main`.
- Never force-push, `reset --hard`, rewrite shared history or delete large
  groups of tracked files without explicit user approval.
- Inspect `git status` and the deletion count before committing.
- Stage explicit paths and inspect the staged diff; never use `git add .` or
  `git add -A` while unrelated or untracked work is present.
- Untracked files are worktree-local, not branch-owned. Protect or isolate
  them before switching branches; never assume a branch switch parks them
  safely.
- Once the user authorizes a scoped implementation, fix or publication,
  routine delivery for that task is also authorized: create a branch, commit,
  push, open or update a pull request, wait for required checks and previews,
  merge when green, verify production and clean up the merged task branch.
  Do not pause for separate approval between those steps unless the user asks
  for local-only work, a review checkpoint or no merge.
- Separate approval is still required to alter branch protection, push
  directly to `main`, force-push, rewrite shared history, delete an unmerged
  remote branch or deploy outside the authorized project and scope.
- Preserve unrelated user changes.

## Audio and transcription

- Station-supplied files are the preferred source. Website extraction, yt-dlp
  and subscriber-access circumvention are not default acquisition methods.
- Audio, working derivatives, raw API responses, private manifests and
  transcript drafts must remain outside the Git repository.
- Use a configurable `BNE_MEDIA_ROOT` (or explicit CLI paths) rather than
  hard-coded personal paths.
- Never print, log or commit API credentials.
- Preserve station-supplied files byte-for-byte; calculate checksums before
  processing.
- Raw and machine-edited transcripts are not publishable. Only a
  human-approved transcript may be written to an archive entry's `transcript`
  field.
- Do not automatically transcribe mixes, performances, broadcasts or song
  lyrics; represent musical passages as `[Music]` unless separately cleared.
- Do not edit archive entry JSON during inventory or raw transcription stages.

## Delivery mode

- Default to fast-track delivery: make the smallest reversible change that
  completes the authorized outcome, using existing architecture, branch
  protection and automated checks.
- Keep verification proportional to risk. Inspect the final diff, run the
  relevant build or tests, require CI to pass and smoke-test preview or
  production when user-facing behaviour changes.
- Resolve ordinary in-scope implementation, build, check and deployment
  failures autonomously. Required checks are delivery gates, not approval
  gates.
- Use best judgment for minor reversible details and fix forward when needed;
  do not block delivery for speculative polish.
- Avoid extra audits, worktrees, manifests, pilots, documentation or approval
  pauses unless they control a concrete material risk or isolate unrelated
  work.
- Stop and ask only when proceeding would materially expand scope, risk data
  loss, require a destructive or irreversible action, expose private data or
  credentials, incur meaningful unapproved cost, rely on ambiguous source or
  publishing rights, overwrite unrelated work, or require bypassing a
  protection or failed required check.

## Working style

- Begin broad or materially risky work with a read-only audit and proposed
  plan; do not add that gate to small reversible changes.
- Use dry runs or one-item pilots when batch mistakes could affect many
  records, incur meaningful cost or be hard to reverse; otherwise proceed
  with the essential checks.
- Make batch work resumable and idempotent.
- Report changed files, tests, build results and remaining uncertainties.
- Stop on ambiguous source matches rather than guessing.
