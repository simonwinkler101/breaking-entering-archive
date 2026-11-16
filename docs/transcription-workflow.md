# Interview transcription instructions

These are the current instructions for acquiring, transcribing, editing and
publishing Breaking and Entering interviews. They supersede conflicting older
protocols. Existing approved transcripts retain their established status.

## 1. Scope and order

Work backwards from the newest interview without a transcript. Use each entry's
full source list when choosing a recording. Check undated recordings and possible
duplicates before assigning dates or treating them as different interviews.

Do not automatically process broadcasts, performances, DJ mixes or song lyrics
as interviews. Mixcloud and SoundCloud downloads and reuploads remain deferred.
Published text does not need another recognition run merely for an editorial edit.

## 2. Access and preservation

Use supplied originals first. Simon has authorised ordinary downloads through
his signed-in Triple R session. Confirm actual playback or a working download;
an account menu alone does not establish audio access. Do not bypass access
controls, expiry restrictions or sign-in requirements, or extract credentials.

If a source is unavailable, record the entry, stable page URL, date and observed
problem privately. Continue with accessible interviews and return to the gap.
Use a verified alternative where available. Record which version was acquired;
subscriber-archive and public-segment editions can have different durations.

Keep source audio outside Git under configurable `BNE_MEDIA_ROOT`. Copy from
Downloads; never move, modify or delete its files. Preserve original bytes and
record entry ID, source page, acquisition date/method, size, duration and SHA-256.
Conversions are separate working derivatives. Never include credentials, cookies
or temporary signed URLs in public content or preservation records.

Access, private processing and republication permission are separate facts.
Simon has confirmed Triple R permission for this project's audio and transcripts;
reuse it within its scope. Do not upload audio to a new processing service without
resolving that disclosure first.

## 3. Processing and system load

Use the existing local Node/FFmpeg/Whisper workflow. Run one recognition job at a
time, normally with two CPU threads and lower process priority. The older queue
uses `--order newest --threads 2`. Thread limits do not disable GPU use.

Keep additional voice analysis local, small and sequential with recognition.
Use official software/model sources and record versions, licences and checksums.
Avoid duplicate runs. Reuse matching completed receipts; retain earlier attempts
when retrying. Reduce or stop processing if it materially interferes with use of
the Mac or the user requests it.

## 4. Faithful timestamped source

Retain raw recognition output and a separate timestamped source transcript, with
source/model hashes, software version, settings, outputs and completed intervals.
Process the complete supplied recording. Distinguish complete engine coverage
from accurate wording, and a complete supplied file from a complete interview.

If processing needs chunks, retain original-relative timestamps and overlap;
check boundaries for omissions and repeated text. Account for uncertain intervals.
Music and silence can produce fluent invented words. Do not transcribe lyrics or
silently accept repeated machine text. Use `[Music]` only when that classification
is established; otherwise use a timed unclear-audio marker. Confidence scores and
repetition flags are review aids, not proof.

## 5. Names and factual checks

Check doubtful names, recordings, labels, venues, events and dates against primary
sources: artist/label pages, official credits, venues, festivals and Triple R.
Correct an unambiguous spelling or title and record the exact change, timestamp,
source and reason privately. Familiar unambiguous names do not need repeated work.

A search can verify a name's spelling or an event's details. It cannot prove the
exact sentence spoken. Do not replace uncertain speech with a biography, press
release, another interview or a plausible sentence found online.

## 6. Mandatory readability edit

Read the entire proposed public transcript before publication. This is required
for every new transcript and subsequent substantive correction. Keep a separate
reading copy; never overwrite the raw or timestamped source to make it agree.

Improve punctuation, sentence boundaries, paragraphing and clearly continuous
fragments. Correct supported recognition errors. Small grammatical repairs are
allowed only when the meaning is unambiguous. Do not preserve an obvious machine
error merely to retain its word sequence. Equally, do not make uncertain audio
sound fluent by guessing.

Join fragments within a continuous turn. Keep paragraph breaks around apparent
questions and responses even when the speakers cannot yet be named. Do not merge
an entire exchange into one paragraph or imply that one person spoke it all.

Preserve the speaker's meaning, voice, facts, qualifications, meaningful
hesitations and self-corrections. Do not paraphrase an argument, rewrite a question,
change a date or claim, remove uncertainty, or join separate passages as one answer.
Keep unusual phrasing when it belongs to the speaker.

Routine station idents, music back-announcements and irrelevant logistics may be
omitted. An awkward radio opening may be replaced by a short factual editorial
introduction identifying the interview, topic and broadcast date. That introduction
is editorial prose, not invented dialogue. Preserve substantive biography, credits,
background and interview context; replacing a broken opening is not permission to
shorten that material. Record substantive omissions and edits privately; show an
omission or timed unclear marker where readers need it.

Use Australian spelling and consistent verified names. Keep uncertain words and
intervals explicit. Web verification or grammatical plausibility must not be
recorded as listening verification.

## 7. Speakers

Divide speech into paragraphs where supported. Use named labels such as
`Lauren Taylor:` only when the identity and turn are established. Preserve existing
approved labels. Do not assign names merely because a passage looks like a
question or answer, or assume that speakers alternate between two people.

Stereo channel energy helps only when microphones occupy useful separate channels.
Voice embeddings can suggest recurring voice groups; they do not name people or
prove exact turn boundaries. Keep candidate groups private until supported by
verified references and suitable checks. An anonymous group is not an identified
person. Leave names unassigned when evidence is insufficient.

## 8. Review records and publication

Keep the recording, timestamped source, reading copy, uncertainty list, name
references and exact correction/omission records together privately. Record what
was actually read, checked, changed and listened to. A full listening review means
checking the complete text against the complete recording; never infer it from a
completed recognition job, a text edit or an approval to publish.

Simon's standing instruction is to publish prepared transcripts and correct them
afterwards, without a separate approval request for each version. A complete
listening review is not a publication gate. The mandatory readability pass still
applies. Where meaning remains unclear, publish the gap rather than invented words.

Public pages simply say “Transcript”. Do not add automatic/draft labels, public
review-status fields, process disclaimers, private review headers or local paths.
Keep actual review state private. Do not claim a check that did not occur. New
publication uses no pull quote unless one is explicitly selected from checked text.

## 9. Release and later corrections

Fill the existing entry in place with
`npm run fill:transcript -- <slug> --md <public-copy>`. Preserve metadata, sources
and audio. Use safe public-only input extraction; do not strip warnings blindly
to bypass a refusal. The reading view stays on the permanent entry page, with
“Read” available within the entry rather than a transcript badge in the index.

Use the protected branch/PR process in `AGENTS.md`. Inspect the exact diff, run
the required build and relevant checks, verify the permanent page and a transcript
search match, require CI to pass, then publish and check production. Keep Triple R
acknowledgement and source links. Publish completed items and later corrections
without waiting for the whole archive or another routine approval.
