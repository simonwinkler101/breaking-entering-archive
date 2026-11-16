# Interview transcription workflow

This is the current workflow for acquiring, transcribing, reviewing and
publishing interviews. It supersedes conflicting older transcription
instructions. Existing approved transcripts remain approved.

## Acquire and preserve

Use a supplied recording first. When Simon authorises subscriber access,
downloads through his ordinary signed-in browser session are also valid
sources. Check that the selected recording actually plays; an account menu
alone does not establish audio access. Do not bypass access controls or ask
for passwords in chat. Prefer a station-supplied original when it offers
better quality.

Keep originals and processing artifacts outside Git under `BNE_MEDIA_ROOT`
or explicit CLI paths. Preserve source bytes. Record the entry ID, source
page, acquisition date and method, file size, duration and SHA-256 checksum.
Never record credentials, cookies or signed access tokens in Git, public
content or provenance metadata. Preserve stable source-page URLs instead.

Access, private processing and publication permission are separate facts.
An authorised download can be processed privately while publication
permission is unresolved. Public audio hosting and publication of a full
transcript require applicable permission; subscriber access does not supply
that permission by itself. Record an applicable permission once and reuse
it within its scope.

## Produce the private source transcript

Keep the raw engine output and a faithful timestamped working transcript.
Record the source checksum, engine/model/version, processing settings and
completed or failed intervals. Use local processing or an already-authorised
service. Do not upload recordings to a new service without resolving that
disclosure first.

Process the supplied recording from beginning to end. Account for its full
duration as speech, music, silence or unclear audio. State whether the
recording is a complete interview or an excerpt. Never describe partially
processed audio as a full transcript.

Prefer one full-recording run when supported reliably. If chunks are needed,
retain original-relative offsets and a short overlap. Check every boundary
for omitted words, repeated overlap and changes of speaker. Resume failed
intervals without discarding successful output.

Preserve meaning, meaningful hesitations and self-corrections. Mark music
as `[Music]`; do not transcribe lyrics. Do not automatically process mixes,
performances or full broadcasts as interviews. Automatic speech recognition
can invent words over music or silence: inspect those intervals rather than
treating every generated sentence as speech.

Use provisional speaker labels until the audio or explicit evidence supports
an identity. Reconcile labels across chunks; they can reset at each boundary.
An engine without speaker separation must not be presented as if it supplied
reliable speaker attribution.

Flag doubtful words, names and speakers at their source timestamps, for
example `[unclear 00:04:12]`, `[name uncertain]` or `[speaker uncertain]`.
Do not silently turn an unclear passage into a fluent invented sentence.
Engine confidence values help prioritise review; they are not proof.

## Prepare the reading draft

Create a separate lightly edited version for readers. Preserve the guest's
spoken wording, meaning, characteristic phrasing and the exchange between
speakers. Improve readability through punctuation, paragraph breaks and
supported speaker labels. Do not paraphrase, substitute words, repair grammar,
reorder a speaker's argument or rewrite an interviewer's question.

Remove accidental duplicated words, abandoned repeated starts, routine station
announcements and logistics when they add nothing to the written interview.
Keep hesitations, qualifications, self-corrections and unusual phrasing when
they affect meaning or convey the speaker's voice. Do not remove a qualification
to make a claim sound more certain. Do not join separate passages so they appear
to be one continuous answer. Record substantive omissions in the private review
notes; mark a public omission where the reader needs it to understand a break.
Do not add facts or silently reconstruct unclear passages.

Check doubtful, identifying or consequential proper nouns against primary
sources: artists, recordings, labels, venues and dates. Verify an unknown
guest's identity before naming them. Familiar, unambiguous names do not need
repeated research. Keep a timestamped list of substantive corrections,
unresolved questions and inferred attributions for audio review.

Use Australian spelling, clear paragraphs and consistent speaker names.
The reading version can omit timestamps; retain them in the private source
transcript. Keep an introduction identifying the interview and include
“Edited for length and clarity” when applicable. Select pull quotes from
the reviewed wording without rewriting them.

Label unreviewed reading copies as drafts. Keep private review questions, raw
engine output and provenance details outside the public transcript. An automatic
draft notice explains that the public reading copy is still being corrected.

## Review and publish

Simon confirmed on 16 November 2026 that the standing rule is to publish prepared
transcript drafts and correct them afterwards, without waiting for a separate
approval of each version. Existing publication permission remains applicable;
do not ask for it again within its scope. This instruction supersedes the older
requirement for Simon or Lauren to approve every version before publication.

Publish each prepared public reading copy with `transcriptStatus: "draft"`.
The page and archive mark must clearly identify it as an automatic draft whose
wording, names and speaker attribution have not yet been fully checked against
the recording. Correct names and titles from primary sources when the match is
unambiguous; record the correction privately. Flag unresolved wording, attribution
and suspected machine artifacts instead of inventing fluent replacements.
Do not publish private review headers, local paths or raw processing metadata.
Do not select pull quotes from a draft. Keep the recording, timestamped source,
uncertainty list and exact public version available for corrections.

Complete listening review remains the condition for describing a transcript as
reviewed. Compare the complete text with the complete supplied recording,
including speaker changes, omissions and passages where recognition supplied
fluent but incorrect words. Record what was actually checked and corrected;
never infer listening review from a filename, a generated draft, a completed
recognition job or a text-only verification pass. Set `transcriptStatus` to
`reviewed` after that full comparison. Existing approved transcripts keep their
established reviewed presentation when the status field is absent.

Use `npm run fill:transcript -- <slug> --status draft --md <public-copy>` to fill
an existing entry in place. The default status is draft; use `--status reviewed`
only for a fully checked version. The filler extracts an explicitly named
transcript section from a private reading draft or refuses private metadata;
inspect its dry run before writing. Preserve entry metadata and source links.
The permanent entry page provides the reading view and transcript search. Follow
the protected branch, build and release workflow in `AGENTS.md`, and publish
corrections through the same routine process without another approval pause.

## Reusable processing

Keep any project pipeline in the existing Node/TypeScript environment. It
may invoke a locally installed transcription executable. Configure paths
and engine settings per run; never hard-code personal paths or credentials.
Use the source checksum, engine/model and settings to recognise completed
runs. Preserve reviewed versions and originals when rerunning an engine.

Continue routine processing within existing authorisation. Ask only when
an unresolved dependency changes the access, disclosure, cost or publication
decision, and name the specific missing dependency.
