---
description: Publish an approved interview transcript into its existing archive entry, end to end.
argument-hint: <slug> [--md <path>] [--quote-index N | --quote "..."] [--speaker "..."]
---

# Publish transcript: `$ARGUMENTS`

The "press go" button for Stage 2 — carrying an **approved** transcript into the
website. It fills the `transcript` (and `pullQuote`) gaps in the *existing*
`content/archive/<slug>.json` and takes it all the way to production. This is the
codified version of the Lael Neale / Mark Ronson flow.

## Preconditions — stop and ask if any fails
- The transcript is **human-approved**. Per `AGENTS.md`, raw or machine-edited
  drafts are never publishable; only an approved transcript may reach an entry's
  `transcript` field. If the source markdown still carries a "DRAFT FOR REVIEW /
  not yet checked against audio" header or unresolved confirm-these flags, treat
  it as **not approved** and confirm with the user before continuing.
- The entry already exists at `content/archive/<slug>.json` (the script refuses
  otherwise — it never creates or overwrites metadata).
- The approved markdown is at
  `<BNE_MEDIA_ROOT>/transcripts/ready-to-publish/<slug>.md`, or a `--md <path>`
  is supplied (e.g. a file the user just handed over).

## Steps
1. **Preview** (no writes):
   `node scripts/fill-transcript.mjs <slug> [flags] --dry-run`
   Sanity-check the character count, the opening line, and the chosen pull quote.
   The default pull quote is the first option in the markdown; use
   `--quote-index N` or `--quote "..."` to choose another, and confirm the pick
   with the user if it isn't obvious.
2. **Branch:** `git checkout -b content/<slug>-transcript` (off an up-to-date `main`).
3. **Fill:** `node scripts/fill-transcript.mjs <slug> [flags]`
4. **Verify the diff is a small, pure insertion** into that one file
   (`git diff --stat` and confirm no lines were removed). Halt on anything else.
5. **Build:** `npm run build` — must pass (record count, permanent pages, sitemap).
   Spot-check that a distinctive phrase renders on `dist/archive/<slug>/index.html`
   and appears in the search payload.
6. **Commit** the single entry file with a message like
   `Publish approved <Artist> transcript and pull quote`, then push the branch.
7. **PR → merge:** open a PR into `main`, wait for the required `build` check
   (and the Netlify deploy preview) to pass, then merge with `--delete-branch`.
8. **Verify production:** confirm the transcript and pull quote are live on the
   production `/archive/<slug>/` page.

## Guardrails
- Never weaken `main` protection or the required `build` check to publish.
- Only `content/archive/<slug>.json` should change. If a build stop condition
  fires (mass deletion, missing `src/main.tsx`, empty archive, page-count
  mismatch), halt and report.
- Report the outcome concisely: changed file, checks, PR link, production result,
  and which pull quote was used (so it's easy to swap later).
