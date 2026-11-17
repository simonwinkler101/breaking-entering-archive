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

The optional `--max-context N` limits the past-text context tokens retained by
whisper.cpp; zero is allowed. Omit it to preserve the engine default and existing
default receipts. Explicit limits are recorded as separate processing settings.
A context limit is not proof of accuracy; all source, gap and readability checks
still apply.

Keep additional voice analysis local, small and sequential with recognition.
Speaker separation uses sherpa-onnx (`sherpa-onnx-node`, Apache-2.0), installed
with the local recognition tools rather than as a website dependency; its
pyannote segmentation and speaker-embedding models come from the project's
GitHub releases, with no account or token. Before relying on a new setup, run it
on one or two recordings whose transcripts already have established speakers and
let a script score the agreement. Use content anchors only to name voices, as
Simon instructed on 16 November 2026. Do not enrol presenter voiceprints or save
speaker embeddings. Separation output stays private with the audio.
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

Unclear audio gets one targeted second pass before publication. Running the same
chunk through the same model and settings mostly reproduces the same gap, so
re-run a window around each marker with 10 to 15 seconds of context on both
sides, relaxed silence filtering or a larger model. Keep recovered words only
where they fit what is said on either side: the engine that left the gap can also
fill it with fluent invention. If the recovery is only filler or laughter, drop
the marker as an ordinary omission. Record each attempt privately; a re-run is
not a listen.

Every marker carries its time; an untimed marker cannot be found again. A gap of
a minute or more is usually a song, but it must be identified before publication:
mark it `[Music]` once that is established, or transcribe the speech. The same
applies when the text stops before the conversation does, unless someone has
listened and the passage stays unintelligible.

Markers belong to the private reading draft, never the page. The public copy
carries no uncertainty or music annotations: edit around what stays unclear by
cutting the fragment, ending the sentence before it, or dropping a question whose
answer is lost, and never fill the gap. An uncertain name is not cut (section 5). Each marker stays on the private listening
list, longest first, until someone listens: `npm run transcripts:gaps -- --from
<draft or folder>` prints it; keep the output outside the repository. `npm run
fill:transcript` refuses any bracketed annotation in a public copy.

## 5. Names and factual checks

Check doubtful names, recordings, labels, venues, events and dates against primary
sources: artist/label pages, official credits, venues, festivals and Triple R.
Correct an unambiguous spelling or title and record the exact change, timestamp,
source and reason privately. Familiar unambiguous names do not need repeated work.

Never drop a name, venue, nickname or title because it is uncertain: those details
are worth preserving. Search for it first, using the context around it (a venue
heard as "the Burmy" is the Birmi, Fitzroy's Birmingham Hotel). If a search cannot
confirm it, keep the name as heard, without brackets, and ask Simon or Lauren in
the report; correct it when they answer. Only a name the recognition lost entirely
is edited around until someone supplies it.

Recognition fails in predictable ways. Read for song titles heard as ordinary
phrases ('Going Out' as "going out"), near-homophones (The Lewers as "The Lures",
Kallista as "Calisto", Francis Plagne as "Francis Plain"), instruments and
equipment (Omnichord as "omnicord", Technics as "techniques"), DJ and producer
names (A-Trak as "A-track", Gang Starr as "gangstar") and brands lowercased into
common nouns (Pioneers). Where reputable sources disagree on a spelling, follow
the subject's own usage and note the disagreement privately.

Check the timeline as well as the spelling. A name can be spelled correctly and
still sit in the wrong clause: recognition drops and swaps words, so a title can
migrate and still read fluently. Check that the claims around each name hold. Is
a record described as forthcoming actually forthcoming? Does the album match the
sleeve described? Do ages, years and durations add up? Where they do not, the
error may be the recognition's or the speaker's, so do not silently correct the
claim. Re-check that interval of the recording where possible. Re-anchor a title
to the clause the facts support only when the recognised words themselves allow
that reading, and treat it as a reconstruction (section 6). Either way, record it
privately and report it first, since it is the edit most likely to be wrong.

Name the guest from the entry or verified evidence only. When a recording does not
name the guest, infer the identity from biographical and discographic details and
verify it against primary sources before writing the name anywhere. Date an
undated interview the same way, from release and tour dates or references such as
"last weekend", and record the reasoning privately; leave the date open when the
evidence is not firm.

A search can verify a name's spelling or an event's details. It cannot prove the
exact sentence spoken. Do not replace uncertain speech with a biography, press
release, another interview or a plausible sentence found online.

## 6. Mandatory readability edit

Read the entire proposed public transcript before publication. This is required
for every new transcript and subsequent substantive correction. Keep a separate
reading copy; never overwrite the raw or timestamped source to make it agree.

The reading version is a written transcript, lightly or even moderately edited
for clarity and interest. A raw conversation holds a lot that sounds good in the
room or on air but is less compelling written. Use expert editorial judgement of
what to keep and what to politely exclude, keeping as much of the conversation,
its natural flow and its back-and-forth as possible. The approved Carla dal Forno,
Lael Neale and Mark Ronson transcripts show the intended result: a factual
introduction, labelled turns, paragraphs by turn, the page test applied, and
questions that read cleanly.

Apply the page test: keep what carries the conversation and omit what only worked
in the room or on air. Routine station idents, music back-announcements, pre- and
post-interview logistics, mid-interview re-introductions, crosstalk fragments
("Yeah." "Totally."), apologies for interrupting and goodbyes beyond a single beat
may be omitted. Remove filler, stutters and false starts that carry no meaning,
keeping a light trace of each speaker's characteristic phrasing ("I guess", "kind
of"). Tighten the hosts' questions and reflections much harder than the guest's
answers: a long or meandering question becomes a clear one that asks the same
thing, and effusive or unanswered reflections go. Keep the substance of any
introduction: biography, credits, background and context. Keep the guest's voice
near-fully, the back-and-forth rhythm, a short host reaction where it earns its
place, and any moment where the conversation comes alive, such as a guest turning
a question back on the host.

Improve punctuation, sentence boundaries, paragraphing and continuous fragments,
and smooth spoken grammar into clear written sentences where the meaning is
plain. Correct supported recognition errors; do not preserve an obvious machine
error merely to retain its word sequence. Equally, do not make uncertain audio
sound fluent by guessing.

Paragraphs follow turns, not machine segments. Give each turn one paragraph, or a
few for a long answer divided where the subject changes. Join fragments within a
continuous turn. Keep paragraph breaks around apparent questions and responses
even when the speakers cannot yet be named. Do not merge an entire exchange into
one paragraph or imply that one person spoke it all.

Preserve the speaker's meaning, voice, facts, qualifications, meaningful
hesitations and self-corrections. Do not paraphrase a guest's argument, change a
date or claim, or join separate passages as one answer. Keep unusual phrasing when
it belongs to the speaker.

Reconstruct a garbled line only when one reading is clearly supported by the
recognised words and verified facts. Choose the most conservative reading, record
it and the alternative privately, and report it. Otherwise cut around it in the
public copy and keep the timed marker in the private draft. Never invent content.

Begin every reading copy with a short factual introduction of one to three
sentences: who spoke with whom, in the studio or remotely, when, and the occasion.
End it with “Edited for length and clarity.” The page sets the first paragraph as the introduction, so it must not be a
speaker's turn. That introduction is editorial prose, not invented dialogue, and
it may replace an awkward radio opening. Preserve substantive biography, credits,
background and interview context; replacing a broken opening is not permission to
shorten that material. Record substantive omissions and edits privately.

Keep uncertain words and intervals explicit in the private draft. Web verification
or grammatical plausibility must not be recorded as listening verification.

House style:

- Australian spelling throughout, including the guests' speech, with one verified
  spelling of each name.
- Minimise dashes in the text; use commas, colons, semicolons or full stops. Keep
  a dash only where speech breaks off, self-corrects or is cut off by the other
  speaker mid-thought. There a comma would imply continuation, a full stop
  completion and an ellipsis a cut. Expect one or two in a transcript.
- Use an ellipsis only for a genuine trailing pause, never to mark or hide a cut.
- Put song titles in single quotes. Leave album, book and film titles in plain
  title case: the publishing step removes markdown emphasis, so italics never
  reach the page.
- Write speaker labels as plain `Name:` at the start of a paragraph (section 7).
  Use no timestamps or bracketed annotations in the public text.
- In the private draft, use one form for each marker: `[Unclear audio at
  00:12:34–00:12:41]` for a passage, `[name uncertain: “warnerball”]` for an
  unresolved name, quoting the recognised form, and `[Music]` only where section
  4 allows it.
- Keep editorial prose plain and specific.

## 7. Speakers

Readers need to know who is speaking. Establish speakers wherever the evidence
allows and label those turns; an unlabelled transcript is a gap to close, not a
safe default.

Start from the entry: `artist` names the guest and `presenters` the expected
hosts. Confirm the line-up from the recording itself, usually its introduction,
including the name of each guest present when a group appears.

A turn's speaker is established when the recording's own content supports it and
nothing contradicts it:

- In-dialogue address. A question put to a guest by name is answered by that
  guest; "Thanks, Lauren" places Lauren in the previous turn and someone else in
  this one.
- Self-identification, or first-person facts that fit only one person present:
  the guest's own record, label or film, or a host's own program or project.
- Role within the line-up. With one host and one guest, a turn whose content
  plainly belongs to one role names that person: introducing the guest, station
  business and questions about the guest's work are the host's, and first-person
  answers about the guest's own work are the guest's.
- Continuity. A sentence that runs across a machine segment or chunk boundary has
  one speaker on both sides, and a word or two the machine assigns elsewhere
  belongs to the sentence it completes.

Speaker separation groups the recording's turns by voice, so one established
turn can name a whole voice. A voice takes a name when at least one of its turns
is established as above and none of its turns contradicts that. Label all its
turns, then spot-check two or three, including its shortest. Separation can split
one person into two voices or merge
two similar ones, so a contradiction, such as a voice answering a question put to
someone else, sends that voice back to turn-by-turn evidence. An unanchored voice
is not an identified person. Recognition's own speaker labels, stereo channel
energy and alternation stay hints, never proof on their own; stereo helps only
when microphones occupy useful separate channels. Do not assign names merely
because a passage looks like a question or answer, or assume that speakers
alternate.

Leave the mechanical work to the separation script: grouping voices, finding
candidate anchors (names in address or self-introduction) and writing one short
summary per recording that gives each voice's talk time, proposed name, basis and
a sample line. Review that summary and the spot-checks rather than rereading the
transcript, then let the script apply the names. For an existing transcript it
matches paragraphs to the timestamped source by text and renames only `Host:` and
`Guest:` turns.

No transcript uses `Host:` or `Guest:` labels. Where nothing above settles a turn,
label the best-supported guess. Weigh together the content (whose work,
instrument, history or project the turn speaks from), the line-up, research into
members' roles and earlier interviews, continuity and machine hints, and choose
the most likely person. Record the basis and confidence privately and list every
guess in the report, lowest confidence first, so Simon or Lauren can correct it in
a word. Credit genuinely inseparable crosstalk to the band, or cut it under the
page test.

Labels use first names, as in the approved transcripts (`Lauren:`, `Simon:`,
`Carla:`), written as plain text at the start of the paragraph; the page styles
them. Use full names in the introduction, and add a surname or initial where two
speakers share a first name. Preserve existing approved labels.

Record privately the basis for any label that rests on role, continuity, an
anchored voice group or a best guess rather than explicit address or
self-identification. Summarise it in the
final report and name the calls most likely to be wrong, so Simon or Lauren can
correct a label in one word. Attribution from content and voice grouping is not
listening verification; never record or describe it as such.

## 8. Review records and publication

Keep the recording, timestamped source, reading copy, uncertainty list, name
references and exact correction/omission records together privately. Record what
was actually read, checked, changed and listened to. A full listening review means
checking the complete text against the complete recording; never infer it from a
completed recognition job, a text edit or an approval to publish.

Simon's standing instruction is to publish prepared transcripts and correct them
afterwards, without a separate approval request for each version. A complete
listening review is not a publication gate. The mandatory readability pass still
applies, and so does section 4's one hold: an unidentified gap of a minute or more,
or text that stops before the conversation does. Where meaning remains unclear,
cut around it rather than invent words, and keep it on the listening list.
Release timing follows the credit-conscious batching rule in section 9.

Public pages simply say “Transcript”, and the introduction ends “Edited for length
and clarity.” Do not add automatic/draft labels, public review-status fields, other
process disclaimers, private review headers or local paths.
Keep actual review state private. Do not claim a check that did not occur.

New publication uses no pull quote unless one is explicitly selected from checked
text. End the reading copy with `## Pull quote options`, which the publishing step
strips: three or four exact, continuous passages of checked wording, without
ellipses, each from a turn whose speaker is established. A good option stands
alone without the question, says something specific about the guest's work,
thinking or experience rather than a courtesy or a plug, and reads at a glance,
usually in one or two sentences. Avoid passages near an unclear marker or a
reconstruction. Offer the options in the final report. Add one, with
`--quote-index` or the CMS field, only when Simon or Lauren chooses it or asks the
agent to choose.

With each publication, give Simon and Lauren a short report they can check against
their memory of the conversation: re-anchored or reconstructed lines first, then
inferred and best-guess speaker calls, lowest confidence first,
unresolved names and names where sources disagree, cuts
they might want back (offered rather than assumed), date reasoning where the date
was inferred, and the pull quote options. Keep it to what they can act on.

## 9. Release and later corrections

Fill the existing entry in place with
`npm run fill:transcript -- <slug> --md <public-copy>`. Preserve metadata, sources
and audio. Use safe public-only input extraction; do not strip warnings blindly
to bypass a refusal. The reading view stays on the permanent entry page, with
“Read” available within the entry rather than a transcript badge in the index.

Use the protected branch/PR process in `AGENTS.md`. Inspect the exact diff, run
the required build and relevant checks, verify the permanent page and a transcript
search match, require CI to pass, then publish and check production. Keep Triple R
acknowledgement and source links.

On 17 November 2026 Simon asked for discretionary live publications to be grouped
to conserve Netlify credits. Keep completed, checked items together on one preview
branch and combine ordinary transcript, audio and metadata changes into
substantial release batches. Check the current credit balance before merging.
Downloads, private transcript work and R2 uploads can continue between live
releases. Urgent material corrections may justify a separate publication; routine
items should not each cause a production deployment. Do not wait for the whole
archive or another routine approval.
