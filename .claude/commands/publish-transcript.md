---
description: Publish a labelled draft or reviewed interview transcript into its existing archive entry, end to end.
argument-hint: <slug> [--md <path>] [--status draft|reviewed] [--no-quote]
---

# Publish transcript: `$ARGUMENTS`

Fill the transcript and status fields in the existing archive entry and take it
through the protected-branch release. Simon's standing instruction of
16 November 2026 is to publish prepared drafts and correct them afterwards,
without waiting for a separate approval of each version.

## Input and status

- The entry must already exist at `content/archive/<slug>.json`.
- Supply a public-only reading copy with `--md <path>`, or use the default
  `<BNE_MEDIA_ROOT>/transcripts/ready-to-publish/<slug>.md`. Keep raw recognition,
  private review notes, local paths and processing metadata outside content.
- New publication defaults to `--status draft`. The website displays its
  automatic-draft notice. Incomplete listening review is not an approval gate
  for this labelled publication; do not claim that it happened.
- Use `--status reviewed` only after a complete comparison with the complete
  recording. Existing approved transcripts remain approved.
- Do not add pull quotes to drafts. For reviewed text, choose only an exact
  quotation from the checked wording.
- Applicable audio/transcript publication permission is already recorded for
  this project. Reuse it within its scope rather than asking again.

## Release

1. Read `AGENTS.md`, refresh `main`, inspect status and create a `codex/` branch.
2. Run `node scripts/fill-transcript.mjs <slug> [flags] --dry-run`. Check the
   status, opening text and length. The filler extracts a named transcript
   section or refuses private metadata; never bypass that refusal by blindly
   removing the warning. Prepare a clean public input instead.
3. Run the same command without `--dry-run`. Inspect the entry diff; preserve
   all metadata and sources. Only the transcript, status and optional reviewed
   quote should change.
4. Run `npm run build`. Check the exact permanent page and one distinctive
   transcript-search match. Confirm that draft text has the automatic-draft
   notice and that no private path or review header appears.
5. Commit the explicit entry file, push, open a PR, wait for required checks
   and the Netlify preview, then merge. No further routine approval is needed.
6. Verify the production transcript, status notice and preserved source links.
   Publish subsequent corrections through the same process.

## Guardrails

- Never weaken `main` protection or the required `build` check to publish.
- Halt on the build stop conditions in `AGENTS.md` or a real access, privacy,
  source-identity or publication-permission problem. Name the exact dependency.
- Keep faithful wording and justified omissions. Flag uncertainty rather than
  paraphrasing or making up words. Do not present suspected lyrics as speech.
- Report the published entry, checks and any remaining review limitation plainly.
