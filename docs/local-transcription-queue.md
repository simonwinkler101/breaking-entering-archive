# Local private transcription queue

`scripts/transcribe-interviews.mjs` turns completed local interview acquisitions
into private machine drafts. It invokes installed `ffmpeg` and `whisper-cli`;
it does not download recordings, install models, call a cloud service, edit
archive entry JSON or publish anything.

Use Node 22 or later, FFmpeg, whisper.cpp and a local GGML model. The supplied
default model path is `BNE_MEDIA_ROOT/working/models/ggml-large-v3-turbo-q5_0.bin`.
All paths can be supplied explicitly. Credentials are unnecessary.

## Preview, then process

Run from the archive checkout. Replace the two example paths with the actual
private media directory and content checkout:

```sh
node scripts/transcribe-interviews.mjs \
  --media-root /absolute/path/to/private-media \
  --repo /absolute/path/to/archive-content \
  --since 2025-11-16 --until 2026-11-16 --dry-run
```

The preview verifies source hashes, existing completion receipts, the model
hash and engine version. It writes nothing. Remove `--dry-run` to process the
queue. `BNE_MEDIA_ROOT` can replace `--media-root`. `--limit 1` bounds an initial
run to one queued interview. `--help` lists all options.

The default dates preserve the explicitly requested 16 November 2025 through
16 November 2026 batch. Supply new dates for a different batch. This is a
resumable foreground command, not a recurring schedule or acquisition service.
It processes the currently available eligible recordings and stops. Run it
again when a new acquisition receipt is available; completed matches are skipped.

To work backwards through older interviews with two CPU threads and a lower
process priority, preview one available job:

```sh
nice -n 15 node scripts/transcribe-interviews.mjs \
  --media-root /absolute/path/to/private-media \
  --repo /absolute/path/to/archive-content \
  --since 2008-01-01 --until 2025-11-15 \
  --order newest --threads 2 --limit 1 --dry-run
```

Remove `--dry-run` to process that job. `--order` accepts `oldest` (the default)
or `newest`; it changes scheduling only. `--threads` accepts a positive integer
and defaults to four. One recognition job still runs at a time. The thread
limit and `nice` reduce CPU demand/priority; they do not disable GPU processing.

## Input boundary and selection

The content checkout's `content/archive/*.json` establishes each entry's ID,
format, date and published transcript. Only dated `Interview` entries
inside the inclusive window are eligible. Guest mixes, live performances,
special programs and broadcasts are excluded. Existing non-empty public
transcripts are skipped without inferring listening review. Work proceeds from
oldest interview date to newest unless `--order newest` is supplied.

The runner reads private `manifests/rrr-on-demand-acquisition-*.json` files,
or the exact paths supplied with repeatable `--manifest` options. It accepts
`files[]` receipts only when `entryAcquisitionComplete` is true and the
recording is a single fragment. It also accepts `existingOriginals[]` and
confirmed matches in `manifests/media-inventory.json`.

Required acquisition fields are `entryId`, `filename` and `sha256`; the filename
resolves within `BNE_MEDIA_ROOT/incoming`. A supplied `durationSeconds` is
checked against the complete converted recording. Only the acquired MP4 or
supplied original is used. HLS manifests, raw segment locations, playback
request URLs, account/session information and acquisition attempt logs are
not copied into transcript metadata or terminal output.

Missing files, incomplete/fragmented receipts and checksum mismatches are
reported as unavailable sources. They are not guessed or downloaded.

## Private outputs and resuming

The private queue state defaults to:

```text
BNE_MEDIA_ROOT/manifests/transcription-queue-SINCE--UNTIL.json
```

Its writes use an atomic replacement and a single-process lock. A stale lock
from a process that no longer exists is recoverable. Only one job runs at a
time. SIGINT/SIGTERM stops the active engine, records interruption and starts
no further jobs.

Each job signature includes entry ID, verified source SHA-256, model SHA-256,
engine version and recognition settings, including the selected thread count.
Scheduling order is not part of the recognition signature, so reversing the
order reuses matching completed jobs. Changing the thread count produces a
separate signature. Completion receipts and their
output hashes are rechecked before work is skipped. The existing compatible
Jazmine Mary pilot receipt is recognised. A different date window uses its own
state file, but also discovers completed receipts in the matching entry and
job-signature attempt directory, newest first. It checks every candidate's
source/model/settings and output hashes; incomplete attempts do not hide an
earlier valid completion. It does not scan unrelated entries or signatures.
Changed sources/models/settings
produce a separate job. An incomplete or failed run is retained; a retry uses
a new attempt directory and never overwrites earlier files.

New artifacts use these private directories:

```text
working/ENTRY/local-SIGNATURE/attempt-NNNN/derivative-mono16k.wav
transcripts/raw/ENTRY/local-SIGNATURE/attempt-NNNN/
transcripts/drafts/ENTRY/local-SIGNATURE/attempt-NNNN/
```

Raw outputs include JSON with token metadata, SRT, VTT, TXT and engine logs.
The draft contains original-relative timestamps and unchanged recognised words.
Its review notes flag low engine scores, repeated text and suspect timestamps.
No speaker identities are inferred. Music or silence may produce false text;
flags do not establish music boundaries and never trigger automatic deletion.
The complete supplied recording is processed in one run. A failed full-recording
interval is retried in full; the first version does not resume within an engine
run. Gaps remain explicitly unclassified until audio review.

The original source checksum is verified again after processing. Metadata
records the model/settings, complete requested interval, acquisition reference
and output hashes. No draft is placed in `ready-to-publish` or in website content.
Follow `docs/transcription-workflow.md` for publication and later
audio review. This runner does not publish or establish review status.

Progress is emitted as JSON lines containing entry IDs, dates, percentages and
completion/failure counts. Recognised speech and private executable errors stay
in private job logs. A failed interview is recorded and the next job continues.
Exit status 2 reports one or more job failures; status 1 reports a queue/setup
problem. Use the same command to retry. A zero-job run verifies the existing
receipts and reports the current state.

## Verification

```sh
node --test scripts/transcribe-interviews.test.mjs
```

The checks cover scope, both scheduling orders, selected threads reaching the
engine/signatures/receipts, incomplete receipts, checksum
failures, a failed job followed by success, retained attempts, matching pilot
reuse, model/settings differences, output integrity, faithful draft wording
and a dry run that leaves no state or output files. A cross-window check proves
that widening the dates reuses completed recent interviews even when the new
window has no state file, and that partial or corrupted attempts are rejected.
