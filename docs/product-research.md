# Product evidence and release boundary

Research snapshot: 2026-07-29. This is product research, not a claim that every
reviewer has the same workflow.

## The repeated jobs

The smallest useful jobs for a solo editor, YouTuber, motion designer, or small
agency are:

1. Put one browser-ready cut in front of a client without making the client learn
   a workspace or create an account.
2. Turn vague feedback into a frame, an on-image mark, and a threaded answer.
3. Keep V1, V2, and later review copies in one small room without becoming a
   media library.
4. Capture an explicit approval or change request.
5. Keep sensitive review media on infrastructure the creator controls and avoid
   paying a second storage provider.

## What people repeatedly report

The evidence is directional. Reddit posts are self-selected and sometimes
promotional, so first-party product pages were used to verify feature scope.

| Pattern                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                  | Product consequence                                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Client friction defeats the review workflow                  | A current videography thread describes some clients finding a full review tool too difficult; another editor wanted fast uploads, password links, frame comments, and no enterprise layer. [Source 1](https://www.reddit.com/r/videography/comments/1s0r0fv/do_your_clients_struggle_with_frameio/), [source 2](https://www.reddit.com/r/vimeo/comments/1tcrzw0/frameio_or_vimeo_review/) | The guest opens one link, types one name, and reviews without an account.                                                       |
| Reply visibility can push conversation back to email         | An editor reports that clients were not alerted to replies, so the editor emailed the replies instead. [Source](https://www.reddit.com/r/editors/comments/1kye2lp/v4_frameio_continues_to_surprise_me/)                                                                                                                                                                                   | Threads are core, but notifications are not claimed in v0.1. The missing notification channel remains explicit.                 |
| Teams resent duplicate storage and features they do not need | Users describe expensive storage and a desire to keep footage in storage they already pay for. [Source 1](https://www.reddit.com/r/vimeo/comments/1tcrzw0/frameio_or_vimeo_review/), [source 2](https://www.reddit.com/r/SideProject/comments/1svc82j/built_a_frameio_alternative_that_runs_on_top_of/)                                                                                   | Marktake uses one local volume and stores only chosen review copies. It is not a hosting service.                               |
| Privacy and contract review can block a cloud tool           | A motion-design case describes a client legal team rejecting a service after a GDPR and AI-terms review. [Source](https://www.reddit.com/r/MotionDesign/comments/1rx7ajr/followup_i_posted_about_my_frameio_alternative_a/)                                                                                                                                                               | Local storage, no telemetry, no third-party media requests, metadata stripping, and a documented operator responsibility model. |
| A new self-hosted tool must earn trust                       | An editors thread warns that an important workflow needs a vetted tool, not merely a new open-source claim. [Source](https://www.reddit.com/r/editors/comments/1ssh624/open_source_frameio/)                                                                                                                                                                                              | Reproducible container, strict scope, security tests, coverage, three-browser E2E, real screenshots, and honest limitations.    |

## Competitive map

| Product        | Verified strength                                                                                                                                                                                                                                                                                                                               | Why Marktake does not chase it                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frame.io       | Frame and range comments, annotations, version stacks, comparison, many sharing and security controls. [Official](https://frame.io/pricing/)                                                                                                                                                                                                    | Marktake does not attempt camera-to-cloud, integrations, enterprise security layers, or a media library.                                                                                        |
| Filestage      | Review statuses, due dates, reviewer groups, reports, external uploads, and broad proofing workflows. [Official](https://filestage.io/pricing/)                                                                                                                                                                                                 | No workflow automation, reports, or general document proofing in v0.1.                                                                                                                          |
| Ziflow         | Advanced proof versions, workflow stages, reactions, and enterprise-scale proofing. [Official](https://www.ziflow.com/pricing)                                                                                                                                                                                                                  | No configurable workflow engine.                                                                                                                                                                |
| Dropbox Replay | Browser review links, markup, comments, finalization, versions, and live review for video, image, and audio. [Official](https://help.dropbox.com/installs/dropbox-replay)                                                                                                                                                                       | No live sessions, Dropbox coupling, or broad media types.                                                                                                                                       |
| Wipster        | A polished hosted workflow with HD playback, storage, projects, and sharing. [Official](https://www.wipster.io/pricing)                                                                                                                                                                                                                         | Marktake has no hosted plan or bundled storage promise.                                                                                                                                         |
| Krock          | Creative project management, animation workflows, feedback, and version control. [Official](https://krock.io/pricing/)                                                                                                                                                                                                                          | No storyboard or project-management surface.                                                                                                                                                    |
| FrameCheck     | Free browser video review with frame comments, threads, annotations, assignees, voice notes, and local analysis. [Official](https://www.framecheck.in/)                                                                                                                                                                                         | Marktake's entry is self-hosting and one-volume ownership, not a larger free hosted feature list.                                                                                               |
| lawn           | A current MIT-licensed video review product with simple guest sharing, exact-frame comments, NLE export, hosted storage, and flat team pricing. Its public repository says the team uses it daily and intentionally prioritizes simple, fast, reliable review. [Official](https://lawn.video/), [repository](https://github.com/pingdotgg/lawn) | Marktake adopts the narrow review-loop philosophy but remains a free, self-hosted one-container release with no hosted storage, billing, NLE export, Convex dependency, or transcoding promise. |
| FreeFrame      | A young MIT self-hosted project with video, image, audio, HLS, Celery, object storage, comments, drawing, approval, and NLE exports. [Project post and repository](https://www.reddit.com/r/selfhosted/comments/1uvd2hd/freeframe_selfhosted_opensource_frameio/)                                                                               | This is the closest direct competitor. Marktake deliberately removes S3, Celery, HLS transcoding, broad formats, and NLE exports from v0.1.                                                     |
| Clapshot       | Mature small self-hosted review tool with a Rust API, Svelte UI, incoming-directory ingest, and conditional FFmpeg transcoding. [Repository](https://github.com/elonen/clapshot)                                                                                                                                                                | Marktake prioritizes private external guest links and a stricter no-transcoding review-copy contract.                                                                                           |
| Shumai         | Privacy-oriented self-hosted creative review with a broader media library and collaboration scope. [Project description](https://openaltfinder.com/tools/shumai)                                                                                                                                                                                | Marktake avoids a media-library architecture and its heavier service graph.                                                                                                                     |
| ViTransfer     | Self-hosted review with secure guest options, automatic 720p or 1080p transcoding, watermarking, and enterprise positioning. [Official](https://www.vitransfer.com/)                                                                                                                                                                            | No transcoding farm, watermarking, email OTP, or enterprise claim.                                                                                                                              |

## The "lawn" reference

The original local phrase was ambiguous on its own. The exact URL supplied later
resolves it: [lawn.video](https://lawn.video/) is a current video review product,
and [pingdotgg/lawn](https://github.com/pingdotgg/lawn) is its public
MIT-licensed repository. GitHub records the repository as created on 2026-02-01.
Its published philosophy is intentionally narrow: simple, fast, reliable video
review with low client friction. Its current product includes hosted storage,
flat paid plans, exact-frame comments, and NLE export.

The useful inspiration is product discipline and communication:

- make the value obvious before listing implementation details;
- present upload, share, and review as one short loop;
- make guest access and speed first-class;
- use direct language and a bold, editorial hierarchy;
- describe exclusions as a product decision, not missing enterprise parity.

Marktake remains operationally different. V0.1 is free self-hosted software,
stores review copies in one operator-controlled volume, has no hosted plan or
billing, does not export to an NLE, and deliberately avoids a Convex or cloud
storage dependency.

No lawn or Loom code, branding, copy, design assets, screenshots, or protected
media are used. The revised landing page uses Marktake's own product screenshot,
copy, color system, and layout.

## Release decision

**V1 is a self-hosted web app presented operationally as a local review server.**

That shape has the lowest credible solo cost:

- A desktop app still needs a guest-reachable server and update channel.
- A hosted browser app creates storage, bandwidth, privacy, billing, and abuse
  obligations that contradict the entry point.
- A generic self-hosted platform tends toward PostgreSQL, object storage,
  workers, queues, and transcoding.
- One Node process, built-in SQLite, FFmpeg validation and remux, and one local
  volume are sufficient for the focused job.

## Release MVP

Included:

- creator password;
- projects and ordered versions;
- native browser playback and authenticated byte ranges;
- rational frame mapping, frame notes, and nominal timecode;
- normalized pin, rectangle, arrow, and freehand annotations;
- replies and owner-controlled resolution;
- approval or change request;
- revocable, expiring, optionally password-protected guest links;
- strict review-copy codecs and limits;
- Docker and Compose deployment.

Excluded:

- automatic transcoding, thumbnails, waveforms, and proxies;
- general images, audio-only files, PDFs, and source formats;
- notifications, NLE exports, live sessions, and real-time multi-user updates;
- organization accounts, roles, SSO, audit logs, and billing;
- cloud hosting, object storage, AI, watermarking, or DRM.

The first useful differentiation is operational simplicity, not a novel comment
feature.
