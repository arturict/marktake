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

const toolLabels: { tool: DrawingTool; label: string; symbol: string }[] = [
  { tool: "pin", label: "Pin", symbol: "●" },
  { tool: "rect", label: "Rectangle", symbol: "□" },
  { tool: "arrow", label: "Arrow", symbol: "↗" },
  { tool: "freehand", label: "Draw", symbol: "∿" },
];

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

  const load = useCallback(async () => {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    const next = await api<ReviewPayload>(`/api/review${query}`);
    setPayload(next);
    setVersionId((current) =>
      next.project.versions.some((version) => version.id === current)
        ? current
        : (next.project.versions[0]?.id ?? ""),
    );
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
      {error && <div className="error-banner floating-error">{error}</div>}
      {payload && version ? (
        <ReviewWorkspace
          version={version}
          capabilities={payload.capabilities}
          selectedCommentId={selectedCommentId}
          onSelectComment={setSelectedCommentId}
          onChanged={load}
          onError={setError}
        />
      ) : (
        <main className="center-shell">
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
}: {
  version: ReviewVersion;
  capabilities: ReviewPayload["capabilities"];
  selectedCommentId: string | null;
  onSelectComment: (id: string | null) => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [tool, setTool] = useState<DrawingTool>("pin");
  const [draft, setDraft] = useState<Annotation[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [busy, setBusy] = useState(false);
  const rate = useMemo(
    () => ({ numerator: version.fpsNumerator, denominator: version.fpsDenominator }),
    [version.fpsDenominator, version.fpsNumerator],
  );
  const selectedComment = version.comments.find(
    (comment) => comment.id === selectedCommentId,
  );

  useEffect(() => {
    setDraft([]);
    setCommentBody("");
    setCurrentFrame(0);
    onSelectComment(null);
  }, [version.id, onSelectComment]);

  const seekFrame = (frame: number): void => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const maxFrame = Math.max(
      0,
      Math.ceil(
        (version.durationMs / 1_000) * (version.fpsNumerator / version.fpsDenominator),
      ) - 1,
    );
    const bounded = Math.max(0, Math.min(maxFrame, frame));
    video.currentTime = frameToMediaTime(bounded, rate);
    setCurrentFrame(bounded);
  };

  return (
    <main className="review-grid">
      <section className="viewer-column">
        <div className="video-stage">
          <video
            ref={videoRef}
            src={version.mediaUrl}
            controls
            preload="metadata"
            playsInline
            onPlay={() => {
              setDraft([]);
              onSelectComment(null);
            }}
            onTimeUpdate={(event) =>
              setCurrentFrame(mediaTimeToFrame(event.currentTarget.currentTime, rate))
            }
            onSeeked={(event) =>
              setCurrentFrame(mediaTimeToFrame(event.currentTarget.currentTime, rate))
            }
          >
            Your browser cannot play this review copy.
          </video>
          <AnnotationOverlay
            tool={tool}
            draft={draft}
            selected={selectedComment?.annotations ?? []}
            onChange={setDraft}
            disabled={!capabilities.canComment || !(videoRef.current?.paused ?? true)}
          />
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
            >
              −1
            </button>
            <code>{formatTimecode(currentFrame, rate)}</code>
            <button
              type="button"
              onClick={() => seekFrame(currentFrame + 1)}
              aria-label="Next frame"
            >
              +1
            </button>
          </div>
          <div className="drawing-tools" aria-label="Annotation tool">
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
              onClick={() => setDraft([])}
              disabled={draft.length === 0}
            >
              Clear
            </button>
          </div>
        </div>
        <form
          className="comment-composer"
          onSubmit={async (event) => {
            event.preventDefault();
            const video = videoRef.current;
            if (!video) return;
            video.pause();
            setBusy(true);
            onError("");
            try {
              await api(`/api/versions/${version.id}/comments`, {
                method: "POST",
                body: JSON.stringify({
                  body: commentBody,
                  frameNumber: currentFrame,
                  timeMs: Math.round(video.currentTime * 1_000),
                  annotations: draft,
                }),
              });
              setCommentBody("");
              setDraft([]);
              await onChanged();
            } catch (reason) {
              onError(
                reason instanceof Error ? reason.message : "Could not save comment.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="composer-meta">
            <span>New note</span>
            <code>{formatTimecode(currentFrame, rate)}</code>
            {draft.length > 0 && <span>{draft.length} markups</span>}
          </div>
          <label className="sr-only" htmlFor="new-comment">
            Comment
          </label>
          <textarea
            id="new-comment"
            placeholder={
              capabilities.canComment
                ? "Pause, mark the frame, and describe the change…"
                : "This review link is read-only."
            }
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            maxLength={2_000}
            disabled={!capabilities.canComment}
            required
          />
          <button
            className="primary-button"
            type="submit"
            disabled={!capabilities.canComment || !commentBody.trim() || busy}
          >
            {busy ? "Saving…" : "Add frame note"}
          </button>
        </form>
        <div className="decision-bar">
          <div>
            <span className="eyebrow">Review decision</span>
            <strong>Is this version ready?</strong>
          </div>
          <button
            className="decision-button changes"
            type="button"
            onClick={() =>
              void submitDecision(version.id, "changes_requested", onChanged, onError)
            }
          >
            Request changes
          </button>
          <button
            className="decision-button approve"
            type="button"
            onClick={() =>
              void submitDecision(version.id, "approved", onChanged, onError)
            }
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
          <span className="open-count">
            {version.comments.filter((comment) => comment.status === "open").length}{" "}
            open
          </span>
        </div>
        <div className="comment-list">
          {version.comments.map((comment, index) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              index={index + 1}
              rate={rate}
              selected={comment.id === selectedCommentId}
              canResolve={capabilities.canResolve}
              canComment={capabilities.canComment}
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
              <p>Pause on a frame, add a pin or drawing, and leave the first note.</p>
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
): Promise<void> {
  try {
    await api(`/api/versions/${versionId}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    await onChanged();
  } catch (reason) {
    onError(reason instanceof Error ? reason.message : "Could not record decision.");
  }
}

function CommentThread({
  comment,
  index,
  rate,
  selected,
  canResolve,
  canComment,
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
  onSelect: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [reply, setReply] = useState("");
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
              try {
                await api(`/api/comments/${comment.id}/replies`, {
                  method: "POST",
                  body: JSON.stringify({ body: reply }),
                });
                setReply("");
                await onChanged();
              } catch (reason) {
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
              onChange={(event) => setReply(event.target.value)}
              placeholder="Reply…"
              maxLength={2_000}
              required
            />
            <button type="submit">Send</button>
          </form>
        )}
        {canResolve && (
          <button
            className="resolve-button"
            type="button"
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
