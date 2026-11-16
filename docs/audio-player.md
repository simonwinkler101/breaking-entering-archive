# Hosted audio

An entry can optionally play a recording hosted in the archive's media storage.
Keep the audio file outside Git. After a cleared recording is uploaded, add an
`audio` object to its existing entry, or use **Hosted audio** in the editor:

```json
{
  "audio": {
    "url": "https://audio.example.org/interviews/recording.mp3",
    "type": "audio/mpeg"
  }
}
```

The example address is illustrative. Use the verified permanent HTTPS file URL;
do not use subscriber sessions, signed URLs or links containing credentials.
The media service must allow public GET and byte-range requests, return the
correct audio content type and support HTTPS. A public audio file is downloadable
by listeners even when the page does not provide a download button.

The player works in the open index entry and its permanent page. It uses small
text controls and an accessible seek control. It does not preload or autoplay
audio. Native browser controls remain available when JavaScript is disabled or
the enhancement cannot run. Closing an index entry stops playback and cancels
its download; starting a second player pauses the first.

Keep the original source link. Published audio and transcripts require applicable
permission; transcript approval remains a separate review step. Leave `audio`
absent until the uploaded file is live and checked. Existing entries continue
to use their ordinary source link when no hosted recording is configured.

Build and release through the normal protected-branch workflow. Verify playback,
pause, keyboard seeking, an unavailable file and the no-JavaScript fallback.
