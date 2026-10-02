# Validate a first review

Use a fresh local test instance and synthetic media. This guide checks the
implemented journey; customer demand remains unvalidated.

## Five-minute demo

1. Sign in as owner. On an empty workspace, choose **Open example review**.
   On an existing workspace, choose **Try local example**. Marktake generates
   a six-second, 24 fps H.264 MP4 locally with FFmpeg. No footage is downloaded.
2. Play, pause, and add a pin to a moment. A keyboard user can focus the
   annotation canvas and press Enter. Write a concrete note, such as
   "Hold this moment for two more frames."
3. Reload before submitting, reopen the example project and choose **Open review**.
   Confirm that the note, pin and timecode return.
   With browser storage blocked, the UI instead explains that the draft stays
   only in the current tab.
4. Submit. Confirm **Saved and sent** and the note in the thread list. In a
   controlled test, block the comment request, confirm **Not saved**, then
   restore the connection and choose **Retry note**.
5. Return to the workspace, open the example project and create a private link.
   Open it in a separate browser context. Enter a synthetic reviewer name,
   leave a note and request changes. On a phone-sized screen, check playback
   and time-linked text feedback. Drawing requires desktop.

The example is an ordinary stored project. It uses the configured storage
quota and can create private review links. Keep the demo on a test instance;
creating a link does not authorize sending it to anyone. Generation allows
three requests per minute per IP and one active encoder per server.

## Recent-workflow conversation

After separately approved outreach, ask an editor about their most recent
completed review. Use the synthetic demo without requesting customer footage.
Keep answers as observations, separate from proposed features.

- How did you send the last cut? Who reviewed it, and how did their notes arrive?
- Pick one requested change. How did you find the exact moment, interpret the
  request and show that it was resolved?
- What did you do when someone reviewed an old version or approved a cut?
- Ask them to leave a note in the demo without explaining the controls. Record
  completion, hesitation, missed save confirmation and any recovery help.
- Would running a container and making browser-ready review copies fit the
  workflow they just described? What would prevent them from trying it?

Do not count praise or a fast synthetic run as purchase intent. The next
customer gate is an editor completing a review with a consenting reviewer,
then explaining whether the saved feedback reduced work in that real review.
That trial, its hosting and any media use need their own approval.
