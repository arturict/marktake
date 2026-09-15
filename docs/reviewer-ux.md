# Reviewer UX contract

Marktake optimizes one first-session outcome: open a review copy, stop at the
relevant moment, leave a clear note, and know whether the note was saved.

This is a product contract, not a claim that every browser can seek to every
encoded frame. Marktake validates constant-frame-rate review copies and stores
the frame number and media time together. Playback still depends on the browser,
codec, and keyframe layout.

## Applied heuristics

The implementation uses these sources as heuristics and checks them against the
actual Marktake workflow:

- Nielsen Norman Group's usability heuristics: show system status, preserve user
  control, favor recognition over recall, and make errors recoverable.
- W3C WCAG 2.2 guidance: keyboard-operable controls, visible focus, sufficient
  text and non-text contrast, and programmatically announced status messages.
- The supplied Mobbin, DesignerUp, Superwall, and Kole Jain summaries: lead with
  the outcome, teach in context, make onboarding skippable, and avoid asking for
  payment before value. Marktake has no paywall or managed-service prompt.

These are not copied flows or visual assets.

## First value path

1. A new owner can generate a six-second local example review. The server uses
   its installed ffmpeg and does not download media.
2. A reviewer can play and pause using native controls.
3. Desktop reviewers can place a markup. Keyboard users can place the selected
   markup at the center by focusing the annotation canvas and pressing Enter.
4. Mobile reviewers get an explicit text-only review mode because precise
   drawing is not reliable on small coarse-pointer surfaces.
5. Saving exposes `Saving`, `Saved and sent`, or `Not saved`. A failed note keeps
   its text and markup ready for retry.

The checklist is contextual, skippable, persistent, and recoverable through
`Show guide`. It never blocks the review.

## State coverage

| State                | User-visible response                                   | Recovery                                |
| -------------------- | ------------------------------------------------------- | --------------------------------------- |
| No project           | Purpose, generated example, own-project action          | Generate example or focus project title |
| No medium            | Explains why review is unavailable                      | Return to owner workspace               |
| Uploading            | Upload, codec validation, and metadata stripping status | Keep tab open                           |
| Upload error         | Plain-language server error, selected file retained     | Retry upload                            |
| Ready                | Version-ready confirmation                              | Open review                             |
| Playback loading     | Media loading status                                    | Wait                                    |
| Codec or media error | No-transcoding boundary and likely causes               | Retry media or supply a supported copy  |
| Annotation draft     | Markup count and browser-local draft status             | Clear or continue                       |
| Saving               | Announced live status and disabled duplicate submit     | Wait                                    |
| Saved                | Announced `Saved and sent` confirmation                 | Continue reviewing                      |
| Offline              | Persistent connection banner and browser-local draft    | Reconnect, then retry                   |
| Concurrent activity  | Draft-preserving conflict notice                        | Refresh threads and review before send  |
| Reload               | Draft, markup, and frame restored from local storage    | Continue or discard                     |
| No comments          | Purpose and direct focus action                         | Write first note                        |
| Empty filter         | Explains that threads remain unchanged                  | Show all notes                          |

## Interaction boundaries

- Desktop is the precise annotation surface.
- Mobile supports playback, time-linked text notes, threads, and decisions. It
  does not present drawing controls.
- Visible frame-step buttons remain the primary mechanism. Shift plus Left or
  Right Arrow is an additional shortcut.
- Dynamic save, upload, connection, conflict, and playback messages use live
  regions or alert semantics.
- The dark workspace keeps the video visually dominant. Comments, metadata,
  decisions, and guidance are secondary surfaces.

## Non-goals

- No transcoding or codec conversion.
- No cloud example download.
- No claim of exact decoded-frame display in every browser.
- No forced onboarding tour.
- No sponsor, pricing, or managed-service interruption before the first note.
