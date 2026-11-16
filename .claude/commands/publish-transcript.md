---
description: Publish a prepared interview transcript into its existing archive entry, end to end.
argument-hint: <slug> [--md <path>] [--no-quote | --quote "..." | --quote-index N]
---

# Publish transcript: `$ARGUMENTS`

Fill the transcript field in the existing archive entry and take it
through the protected-branch release. Simon's standing instruction of
16 November 2026 is to publish prepared drafts and correct them afterwards,
without waiting for a separate approval of each version.

## Input and private review records

- The entry must already exist at `content/archive/<slug>.json`.
- Supply a public-only reading copy with `--md <path>`, or use the default
  `<BNE_MEDIA_ROOT>/transcripts/ready-to-publish/<slug>.md`. Keep raw recognition,
  private review notes, local paths and processing metadata outside content.
- Public pages simply say “Transcript”, without automatic/draft labels, public
  review-status fields or process disclaimers. Actual review state and correction
  receipts stay private. Incomplete listening review is not an approval gate for
  this publication; do not claim that it happened.
- Existing approved transcripts remain approved. New publication uses no pull
  quote unless Simon or Lauren selects one, or asks for one to be chosen. Offer
  three or four exact, continuous passages of checked wording in the report.
- Applicable audio/transcript publication permission is already recorded for
  this project. Reuse it within its scope rather than asking again.

## Release

1. Read `AGENTS.md`, refresh `main`, inspect status and create a `codex/` branch.
2. Run `node scripts/fill-transcript.mjs <slug> [flags] --dry-run`. Check the
   length, that the first paragraph is the factual introduction, that turns
   carry established speaker labels, and that paragraphs follow turns rather
   than machine segments. It refuses untimed `[Unclear audio]` markers and
   unidentified gaps of a minute or more (section 4 of the workflow); give every
   marker its second pass and time first, and use `--gaps-checked` only after
   someone has listened. The filler extracts a named transcript
   section or refuses private metadata; never bypass that refusal by blindly
   removing the warning. Prepare a clean public input instead.
3. Run the same command without `--dry-run`. Inspect the entry diff; preserve
   all metadata and sources. Only the transcript and optional explicitly selected
   quote should change.
4. Run `npm run build`. Check the exact permanent page and one distinctive
   transcript-search match. Confirm that no private path, review header, public
   status field or process label appears.
5. Commit the explicit entry file, push, open a PR, wait for required checks
   and the Netlify preview, then merge. No further routine approval is needed.
6. Verify the production transcript and preserved source links.
   Publish subsequent corrections through the same process.

## Guardrails

- Never weaken `main` protection or the required `build` check to publish.
- Halt on the build stop conditions in `AGENTS.md` or a real access, privacy,
  source-identity or publication-permission problem. Name the exact dependency.
- Keep faithful wording and justified omissions. Flag uncertainty rather than
  paraphrasing or making up words. Do not present suspected lyrics as speech.
- Report the published entry, checks and any remaining review limitation plainly,
  with the review items in `docs/transcription-workflow.md` section 8:
  re-anchored or reconstructed lines first, inferred speaker calls, unresolved
  names, cuts Simon or Lauren may want back, markers still on the listening
  list and the pull quote options.
