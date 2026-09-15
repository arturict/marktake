import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatTimecode,
  frameToMediaTime,
  mediaTimeToFrame,
  type Annotation,
  type ReviewComment,
  type ReviewProject,
  type ReviewVersion,
  type SessionInfo,
} from "@marktake/shared";
import { api } from "../api.js";
import {
  draftStorageKey,
  parseStoredReviewDraft,
  reviewRevision,
} from "../reviewDraft.js";
import { AnnotationOverlay, type DrawingTool } from "./AnnotationOverlay.js";
import { Brand } from "./Brand.js";

type ReviewPayload = {
  project: ReviewProject;
  capabilities: {
    canComment: boolean;
    canResolve: boolean;
    canShare: boolean;
  };
};

type CommentFilter = "all" | "open" | "resolved";
type SaveState = "draft" | "saving" | "saved" | "error";
type MediaState = "loading" | "ready" | "buffering" | "error";

const toolLabels: { tool: DrawingTool; label: string; symbol: string }[] = [
  { tool: "pin", label: "Pin", symbol: "●" },
  { tool: "rect", label: "Rectangle", symbol: "□" },
  { tool: "arrow", label: "Arrow", symbol: "↗" },
  { tool: "freehand", label: "Draw", symbol: "∿" },
];

function safeLocalStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A blocked storage API should not prevent a review.
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // A blocked storage API should not prevent a review.
  }
}

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const handleOnline = (): void => setOnline(true);
    const handleOffline = (): void => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
  return online;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const handleChange = (): void => setMatches(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);
  return matches;
}

export function ReviewRoom({
  session,
  projectId,
  onExit,
}: {
  session: SessionInfo;
  projectId?: string;
  onExit: () => void;
}): React.JSX.Element {
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [versionId, setVersionId] = useState("");
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const online = useOnlineStatus();

  const load = useCallback(async () => {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    const next = await api<ReviewPayload>(`/api/review${query}`);
    setPayload(next);
    setVersionId((current) =>
      next.project.versions.some((version) => version.id === current)
        ? current
        : (next.project.versions[0]?.id ?? ""),
    );
    setError("");
  }, [projectId]);

  useEffect(() => {
    void load().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : "Could not open review."),
    );
  }, [load]);

  const version = payload?.project.versions.find((item) => item.id === versionId);

  return (
    <div className="review-shell">
      <header className="review-topbar">
        <button className="back-button" type="button" onClick={onExit}>
          ← {session.kind === "admin" ? "Workspace" : "Leave review"}
        </button>
        <Brand compact />
        <div className="review-title">
          <strong>{payload?.project.title ?? "Opening review…"}</strong>
          {version && (
            <span>
              V{version.ordinal} · {version.label}
            </span>
          )}
        </div>
        {payload && (
          <select
            aria-label="Review version"
            className="version-select"
            value={versionId}
            onChange={(event) => {
              setVersionId(event.target.value);
              setSelectedCommentId(null);
            }}
          >
            {payload.project.versions.map((item) => (
              <option key={item.id} value={item.id}>
                V{item.ordinal} · {item.label}
              </option>
            ))}
          </select>
        )}
        <span className="user-chip">{session.displayName}</span>
      </header>
      {!online && (
        <div className="connection-banner" role="status" aria-live="polite">
          <span aria-hidden="true">●</span>
          Connection lost. Your unfinished note stays in this browser. Saving will work
          again when the server is reachable.
        </div>
      )}
      {error && (
        <div className="error-banner floating-error action-banner" role="alert">
          <span>{error}</span>
          <button type="button" disabled={!online} onClick={() => void load()}>
            Reload latest
          </button>
        </div>
      )}
      {payload && version ? (
        <ReviewWorkspace
          key={version.id}
          version={version}
          capabilities={payload.capabilities}
          selectedCommentId={selectedCommentId}
          onSelectComment={setSelectedCommentId}
          onChanged={load}
          onError={setError}
          online={online}
        />
      ) : payload ? (
        <main className="center-shell review-empty">
          <span className="empty-icon">00</span>
          <h1>No review copy yet.</h1>
          <p className="muted">
            This project exists, but it has no playable version. Add an MP4 or WebM in
            the owner workspace first.
          </p>
          <button className="primary-button" type="button" onClick={onExit}>
            Return to workspace
          </button>
        </main>
      ) : (
        <main className="center-shell" aria-busy="true">
          <span className="loading-indicator" aria-hidden="true" />
          <p className="muted">Preparing the latest cut…</p>
        </main>
      )}
    </div>
  );
}

function ReviewWorkspace({
  version,
  capabilities,
  selectedCommentId,
  onSelectComment,
  onChanged,
  onError,
  online,
}: {
  version: ReviewVersion;
  capabilities: ReviewPayload["capabilities"];
  selectedCommentId: string | null;
  onSelectComment: (id: string | null) => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  online: boolean;
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentRevision = useMemo(
    () => reviewRevision(version.comments),
    [version.comments],
  );
  const storedDraft = useMemo(
    () => parseStoredReviewDraft(safeLocalStorageGet(draftStorageKey(version.id))),
    [version.id],
  );
  const [currentFrame, setCurrentFrame] = useState(storedDraft?.frameNumber ?? 0);
  const [tool, setTool] = useState<DrawingTool>("pin");
  const [draft, setDraft] = useState<Annotation[]>(storedDraft?.annotations ?? []);
  const [commentBody, setCommentBody] = useState(storedDraft?.body ?? "");
  const [baseRevision, setBaseRevision] = useState(
    storedDraft?.baseRevision ?? currentRevision,
  );
  const [saveState, setSaveState] = useState<SaveState>(
    storedDraft ? "draft" : "draft",
  );
  const [mediaState, setMediaState] = useState<MediaState>("loading");
  const [filter, setFilter] = useState<CommentFilter>("all");
  const [hasPlayed, setHasPlayed] = useState(false);
  const [hasPaused, setHasPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [hasSavedNote, setHasSavedNote] = useState(false);
  const [showResume, setShowResume] = useState(Boolean(storedDraft));
  const [decisionState, setDecisionState] = useState("");
  const [conflict, setConflict] = useState(
    Boolean(storedDraft && storedDraft.baseRevision !== currentRevision),
  );
  const [guideVisible, setGuideVisible] = useState(
    () => safeLocalStorageGet("marktake.review-guide.v1") !== "hidden",
  );
  const mobileReview = useMediaQuery("(max-width: 700px), (pointer: coarse)");
  const rate = useMemo(
    () => ({ numerator: version.fpsNumerator, denominator: version.fpsDenominator }),
    [version.fpsDenominator, version.fpsNumerator],
  );
  const selectedComment = version.comments.find(
    (comment) => comment.id === selectedCommentId,
  );
  const filteredComments = version.comments.filter(
    (comment) => filter === "all" || comment.status === filter,
  );
  const hasDraft = Boolean(commentBody.trim() || draft.length);

  const seekFrame = useCallback(
    (frame: number): void => {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      const maxFrame = Math.max(
        0,
        Math.ceil(
          (version.durationMs / 1_000) *
            (version.fpsNumerator / version.fpsDenominator),
        ) - 1,
      );
      const bounded = Math.max(0, Math.min(maxFrame, frame));
      video.currentTime = frameToMediaTime(bounded, rate);
      setCurrentFrame(bounded);
      setHasPaused(true);
    },
    [rate, version.durationMs, version.fpsDenominator, version.fpsNumerator],
  );

  useEffect(() => {
    if (hasDraft) {
      safeLocalStorageSet(
        draftStorageKey(version.id),
        JSON.stringify({
          body: commentBody,
          annotations: draft,
          frameNumber: currentFrame,
          baseRevision,
        }),
      );
    } else {
      safeLocalStorageRemove(draftStorageKey(version.id));
      setBaseRevision(currentRevision);
      setConflict(false);
    }
  }, [
    baseRevision,
    commentBody,
    currentFrame,
    currentRevision,
    draft,
    hasDraft,
    version.id,
  ]);

  useEffect(() => {
    if (hasDraft && currentRevision !== baseRevision) setConflict(true);
  }, [baseRevision, currentRevision, hasDraft]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        !event.shiftKey
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekFrame(currentFrame - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seekFrame(currentFrame + 1);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [currentFrame, seekFrame]);

  const updateDraft = (annotations: Annotation[]): void => {
    if (!hasDraft) setBaseRevision(currentRevision);
    setDraft(annotations);
    setSaveState("draft");
  };

  const updateCommentBody = (value: string): void => {
    if (!hasDraft) setBaseRevision(currentRevision);
    setCommentBody(value);
    setSaveState("draft");
  };

  return (
    <main className="review-grid">
      <section className="viewer-column">
        {showResume && (
          <div className="resume-banner" role="status">
            <span>
              <strong>Draft restored.</strong> Your unfinished note and markups stayed
              in this browser.
            </span>
            <button
              type="button"
              onClick={() => {
                setCommentBody("");
                setDraft([]);
                setSaveState("draft");
                setShowResume(false);
              }}
            >
              Discard
            </button>
          </div>
        )}
        {conflict && (
          <div className="conflict-banner" role="alert">
            <div>
              <strong>New review activity arrived.</strong>
              <span>
                Your draft is preserved. Reload the latest threads before sending, or
                continue if the new activity does not affect this note.
              </span>
            </div>
            <button type="button" disabled={!online} onClick={() => void onChanged()}>
              Refresh threads
            </button>
          </div>
        )}
        <div className="video-stage">
          <video
            ref={videoRef}
            src={version.mediaUrl}
            controls
            preload="metadata"
            playsInline
            onLoadedMetadata={() => {
              if (storedDraft?.frameNumber) seekFrame(storedDraft.frameNumber);
            }}
            onLoadedData={() => setMediaState("ready")}
            onCanPlay={() => setMediaState("ready")}
            onWaiting={() => setMediaState("buffering")}
            onError={() => setMediaState("error")}
            onPlay={() => {
              setHasPlayed(true);
              setPlaying(true);
              onSelectComment(null);
            }}
            onPause={() => {
              setPlaying(false);
              if (hasPlayed) setHasPaused(true);
            }}
            onTimeUpdate={(event) => {
              if (!hasDraft) {
                setCurrentFrame(
                  mediaTimeToFrame(event.currentTarget.currentTime, rate),
                );
              }
            }}
            onSeeked={(event) => {
              if (!hasDraft) {
                setCurrentFrame(
                  mediaTimeToFrame(event.currentTarget.currentTime, rate),
                );
              }
            }}
          >
            Your browser cannot play this review copy.
          </video>
          <AnnotationOverlay
            tool={tool}
            draft={draft}
            selected={selectedComment?.annotations ?? []}
            onChange={updateDraft}
            disabled={
              mobileReview ||
              !capabilities.canComment ||
              playing ||
              mediaState !== "ready"
            }
          />
          {mediaState === "loading" && (
            <div className="media-overlay" role="status">
              <span className="loading-indicator" aria-hidden="true" />
              Loading review copy…
            </div>
          )}
          {mediaState === "buffering" && (
            <div className="media-overlay compact" role="status">
              Buffering…
            </div>
          )}
          {mediaState === "error" && (
            <div className="media-overlay media-error" role="alert">
              <strong>This review copy could not be played.</strong>
              <span>
                Check the connection and browser codec support. Marktake does not
                transcode uploaded media.
              </span>
              <button
                type="button"
                onClick={() => {
                  setMediaState("loading");
                  videoRef.current?.load();
                }}
              >
                Retry media
              </button>
            </div>
          )}
          {guideVisible &&
            hasPaused &&
            !mobileReview &&
            capabilities.canComment &&
            draft.length === 0 &&
            mediaState === "ready" && (
              <div className="context-hint" role="status">
                <strong>Paused here?</strong>
                <span>Choose a markup, then click the frame to attach it.</span>
              </div>
            )}
          <div className="stage-status">
            <span className={`decision ${version.status}`}>
              {version.status.replace("_", " ")}
            </span>
            <span>
              {version.width}×{version.height} ·{" "}
              {(version.fpsNumerator / version.fpsDenominator).toFixed(3)} fps CFR
            </span>
          </div>
        </div>
        <div className="review-controls">
          <div className="frame-control">
            <button
              type="button"
              onClick={() => seekFrame(currentFrame - 1)}
              aria-label="Previous frame"
              aria-keyshortcuts="Shift+ArrowLeft"
              title="Previous frame (Shift + Left Arrow)"
            >
              −1
            </button>
            <code aria-label={`Current timecode ${formatTimecode(currentFrame, rate)}`}>
              {formatTimecode(currentFrame, rate)}
            </code>
            <button
              type="button"
              onClick={() => seekFrame(currentFrame + 1)}
              aria-label="Next frame"
              aria-keyshortcuts="Shift+ArrowRight"
              title="Next frame (Shift + Right Arrow)"
            >
              +1
            </button>
          </div>
          {!mobileReview ? (
            <div className="drawing-tools" aria-label="Annotation tools">
              {toolLabels.map((item) => (
                <button
                  key={item.tool}
                  type="button"
                  className={tool === item.tool ? "active" : ""}
                  aria-pressed={tool === item.tool}
                  onClick={() => setTool(item.tool)}
                  title={item.label}
                >
                  <span aria-hidden="true">{item.symbol}</span>
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => updateDraft([])}
                disabled={draft.length === 0}
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="mobile-review-mode" role="note">
              Mobile review uses playback and time-linked text notes. Open this review
              on desktop for reliable drawing.
            </div>
          )}
          <button
            className="guide-toggle"
            type="button"
            aria-expanded={guideVisible}
            onClick={() => {
              const next = !guideVisible;
              setGuideVisible(next);
              if (next) safeLocalStorageRemove("marktake.review-guide.v1");
              else safeLocalStorageSet("marktake.review-guide.v1", "hidden");
            }}
          >
            {guideVisible ? "Hide guide" : "Show guide"}
          </button>
        </div>
        <p id="annotation-help" className="annotation-help">
          Pointer users can draw directly on a paused frame. Keyboard users can focus
          the annotation canvas and press Enter to add the selected markup at center.
          Shift plus Left or Right Arrow moves one frame.
        </p>
        {guideVisible && capabilities.canComment && (
          <section className="review-guide" aria-labelledby="review-guide-title">
            <div>
              <span className="eyebrow">First review</span>
              <h2 id="review-guide-title">Three steps to a useful note</h2>
            </div>
            <ol>
              <li className={hasPaused ? "complete" : ""}>
                <span aria-hidden="true">{hasPaused ? "✓" : "1"}</span>
                Play, then pause where feedback belongs
              </li>
              <li className={draft.length > 0 || mobileReview ? "complete" : ""}>
                <span aria-hidden="true">
                  {draft.length > 0 || mobileReview ? "✓" : "2"}
                </span>
                {mobileReview ? "Use the current time" : "Mark the paused frame"}
              </li>
              <li className={hasSavedNote ? "complete" : ""}>
                <span aria-hidden="true">{hasSavedNote ? "✓" : "3"}</span>
                Write the change and save the note
              </li>
            </ol>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setGuideVisible(false);
                safeLocalStorageSet("marktake.review-guide.v1", "hidden");
              }}
            >
              Skip for now
            </button>
          </section>
        )}
        <form
          className="comment-composer"
          onSubmit={async (event) => {
            event.preventDefault();
            const video = videoRef.current;
            if (!video) return;
            video.pause();
            video.currentTime = frameToMediaTime(currentFrame, rate);
            setSaveState("saving");
            onError("");
            try {
              await api(`/api/versions/${version.id}/comments`, {
                method: "POST",
                body: JSON.stringify({
                  body: commentBody,
                  frameNumber: currentFrame,
                  timeMs: Math.round(frameToMediaTime(currentFrame, rate) * 1_000),
                  annotations: draft,
                }),
              });
              setCommentBody("");
              setDraft([]);
              safeLocalStorageRemove(draftStorageKey(version.id));
              await onChanged();
              setHasSavedNote(true);
              setShowResume(false);
              setSaveState("saved");
            } catch (reason) {
              setSaveState("error");
              onError(
                reason instanceof Error ? reason.message : "Could not save comment.",
              );
            }
          }}
        >
          <div className="composer-meta">
            <span>New note</span>
            <code>{formatTimecode(currentFrame, rate)}</code>
            {draft.length > 0 && <span>{draft.length} markups</span>}
            <span
              className={`save-state ${saveState}`}
              role="status"
              aria-live="polite"
            >
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved and sent"
                  : saveState === "error"
                    ? "Not saved"
                    : hasDraft
                      ? "Draft saved in this browser"
                      : "Ready"}
            </span>
          </div>
          <label className="sr-only" htmlFor="new-comment">
            Comment
          </label>
          <textarea
            id="new-comment"
            placeholder={
              capabilities.canComment
                ? mobileReview
                  ? "Describe the change at this playback time…"
                  : "Pause, mark the frame, and describe the change…"
                : "This review link is read-only."
            }
            value={commentBody}
            onChange={(event) => updateCommentBody(event.target.value)}
            maxLength={2_000}
            disabled={!capabilities.canComment}
            required
          />
          <button
            className="primary-button"
            type="submit"
            disabled={
              !capabilities.canComment ||
              !commentBody.trim() ||
              saveState === "saving" ||
              !online
            }
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "error"
                ? "Retry note"
                : "Add frame note"}
          </button>
        </form>
        <div className="decision-bar">
          <div>
            <span className="eyebrow">Review decision</span>
            <strong>Is this version ready?</strong>
            {decisionState && (
              <span className="decision-feedback" role="status">
                {decisionState}
              </span>
            )}
          </div>
          <button
            className="decision-button changes"
            type="button"
            disabled={!online || decisionState === "Saving decision…"}
            onClick={async () => {
              setDecisionState("Saving decision…");
              const saved = await submitDecision(
                version.id,
                "changes_requested",
                onChanged,
                onError,
              );
              setDecisionState(saved ? "Changes requested and saved." : "Not saved.");
            }}
          >
            Request changes
          </button>
          <button
            className="decision-button approve"
            type="button"
            disabled={!online || decisionState === "Saving decision…"}
            onClick={async () => {
              setDecisionState("Saving decision…");
              const saved = await submitDecision(
                version.id,
                "approved",
                onChanged,
                onError,
              );
              setDecisionState(saved ? "Approval saved." : "Not saved.");
            }}
          >
            Approve version
          </button>
        </div>
      </section>
      <aside className="comments-panel">
        <div className="comments-heading">
          <div>
            <span className="eyebrow">Frame notes</span>
            <h2>{version.comments.length} threads</h2>
          </div>
          <div className="comment-summary">
            <span className="open-count">
              {version.comments.filter((comment) => comment.status === "open").length}{" "}
              open
            </span>
            <label>
              <span className="sr-only">Filter frame notes</span>
              <select
                aria-label="Filter frame notes"
                value={filter}
                onChange={(event) => setFilter(event.target.value as CommentFilter)}
              >
                <option value="all">All notes</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
          </div>
        </div>
        <div className="comment-list">
          {filteredComments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              index={version.comments.indexOf(comment) + 1}
              rate={rate}
              selected={comment.id === selectedCommentId}
              canResolve={capabilities.canResolve}
              canComment={capabilities.canComment}
              online={online}
              onSelect={() => {
                onSelectComment(comment.id);
                seekFrame(comment.frameNumber);
              }}
              onChanged={onChanged}
              onError={onError}
            />
          ))}
          {version.comments.length === 0 && (
            <div className="comment-empty">
              <span>00:00:00:00</span>
              <h3>No frame notes yet.</h3>
              <p>
                Pause on the moment, add an optional markup on desktop, and describe the
                first change.
              </p>
              <button
                type="button"
                onClick={() =>
                  document.querySelector<HTMLTextAreaElement>("#new-comment")?.focus()
                }
              >
                Write the first note
              </button>
            </div>
          )}
          {version.comments.length > 0 && filteredComments.length === 0 && (
            <div className="comment-empty filter-empty">
              <span>0</span>
              <h3>No {filter} notes.</h3>
              <p>The current filter has no matches. Existing threads are unchanged.</p>
              <button type="button" onClick={() => setFilter("all")}>
                Show all notes
              </button>
            </div>
          )}
        </div>
      </aside>
    </main>
  );
}

async function submitDecision(
  versionId: string,
  decision: "approved" | "changes_requested",
  onChanged: () => Promise<void>,
  onError: (message: string) => void,
): Promise<boolean> {
  try {
    await api(`/api/versions/${versionId}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    await onChanged();
    return true;
  } catch (reason) {
    onError(reason instanceof Error ? reason.message : "Could not record decision.");
    return false;
  }
}

function CommentThread({
  comment,
  index,
  rate,
  selected,
  canResolve,
  canComment,
  online,
  onSelect,
  onChanged,
  onError,
}: {
  comment: ReviewComment;
  index: number;
  rate: { numerator: number; denominator: number };
  selected: boolean;
  canResolve: boolean;
  canComment: boolean;
  online: boolean;
  onSelect: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [reply, setReply] = useState("");
  const [replyState, setReplyState] = useState("");
  return (
    <article className={`comment-thread ${selected ? "selected" : ""}`}>
      <button className="comment-main" type="button" onClick={onSelect}>
        <span className="comment-number">{index.toString().padStart(2, "0")}</span>
        <span className="comment-content">
          <span className="comment-meta">
            <strong>{comment.authorName}</strong>
            <code>{formatTimecode(comment.frameNumber, rate)}</code>
            <span className={`status ${comment.status}`}>{comment.status}</span>
          </span>
          <span className="comment-body">{comment.body}</span>
          {comment.annotations.length > 0 && (
            <span className="markup-count">
              ◉ {comment.annotations.length} on-frame
            </span>
          )}
        </span>
      </button>
      {comment.replies.map((item) => (
        <div className="reply" key={item.id}>
          <strong>{item.authorName}</strong>
          <span>{item.body}</span>
        </div>
      ))}
      <div className="thread-actions">
        {canComment && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setReplyState("Saving…");
              try {
                await api(`/api/comments/${comment.id}/replies`, {
                  method: "POST",
                  body: JSON.stringify({ body: reply }),
                });
                setReply("");
                await onChanged();
                setReplyState("Saved");
              } catch (reason) {
                setReplyState("Not saved");
                onError(
                  reason instanceof Error ? reason.message : "Could not add reply.",
                );
              }
            }}
          >
            <label className="sr-only" htmlFor={`reply-${comment.id}`}>
              Reply to {comment.authorName}
            </label>
            <input
              id={`reply-${comment.id}`}
              value={reply}
              onChange={(event) => {
                setReply(event.target.value);
                setReplyState("");
              }}
              placeholder="Reply…"
              maxLength={2_000}
              required
            />
            <button type="submit" disabled={!online || replyState === "Saving…"}>
              {replyState === "Not saved" ? "Retry" : "Send"}
            </button>
            {replyState && (
              <span className="reply-state" role="status">
                {replyState}
              </span>
            )}
          </form>
        )}
        {canResolve && (
          <button
            className="resolve-button"
            type="button"
            disabled={!online}
            onClick={async () => {
              try {
                await api(`/api/comments/${comment.id}/status`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    status: comment.status === "open" ? "resolved" : "open",
                  }),
                });
                await onChanged();
              } catch (reason) {
                onError(
                  reason instanceof Error ? reason.message : "Could not change status.",
                );
              }
            }}
          >
            {comment.status === "open" ? "Resolve" : "Reopen"}
          </button>
        )}
      </div>
    </article>
  );
}
