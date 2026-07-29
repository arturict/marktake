import { useCallback, useEffect, useState } from "react";
import type { ReviewProject, SessionInfo } from "@marktake/shared";
import { api } from "../api.js";
import { Brand } from "./Brand.js";

type ProjectSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
};

type ShareSummary = {
  id: string;
  expiresAt: string | null;
  revokedAt: string | null;
  allowComments: boolean;
  passwordProtected: boolean;
  createdAt: string;
};

export function AdminHome({
  session,
  onReview,
  onLogout,
}: {
  session: SessionInfo;
  onReview: (projectId: string) => void;
  onLogout: () => void;
}): React.JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const result = await api<{ projects: ProjectSummary[] }>("/api/projects");
    setProjects(result.projects);
  }, []);

  useEffect(() => {
    void refresh().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : "Could not load projects."),
    );
  }, [refresh]);

  if (selectedId) {
    return (
      <ProjectSetup
        projectId={selectedId}
        onBack={() => {
          setSelectedId(null);
          void refresh();
        }}
        onReview={() => onReview(selectedId)}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <span className="user-chip">{session.displayName}</span>
          <button className="text-button" type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="dashboard">
        <section className="dashboard-heading">
          <div>
            <div className="eyebrow">Local review rooms</div>
            <h1>Projects</h1>
            <p>
              Each project keeps its versions, frame notes, threads, and decisions
              together.
            </p>
          </div>
          <form
            className="new-project-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              try {
                const created = await api<{ id: string }>("/api/projects", {
                  method: "POST",
                  body: JSON.stringify({ title: newTitle }),
                });
                setNewTitle("");
                await refresh();
                setSelectedId(created.id);
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Could not create project.",
                );
              }
            }}
          >
            <label className="sr-only" htmlFor="new-project-title">
              Project title
            </label>
            <input
              id="new-project-title"
              placeholder="Project title"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              maxLength={120}
              required
            />
            <button className="primary-button" type="submit">
              New project
            </button>
          </form>
        </section>
        {error && <div className="error-banner">{error}</div>}
        <section className="project-grid" aria-label="Projects">
          {projects.map((project) => (
            <button
              type="button"
              className="project-card"
              key={project.id}
              onClick={() => setSelectedId(project.id)}
            >
              <span className="project-card-visual">
                <span className="project-index">
                  {project.title.slice(0, 2).toUpperCase()}
                </span>
                <span className="project-play" aria-hidden="true">
                  ▶
                </span>
              </span>
              <span className="project-card-copy">
                <strong>{project.title}</strong>
                <small>
                  {project.versionCount}{" "}
                  {project.versionCount === 1 ? "version" : "versions"} · updated{" "}
                  {new Date(project.updatedAt).toLocaleDateString()}
                </small>
              </span>
              <span className="project-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
          {projects.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">01</span>
              <h2>Start with one review cut.</h2>
              <p>
                Create a project, upload a browser-ready CFR video, and send one private
                link.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ProjectSetup({
  projectId,
  onBack,
  onReview,
}: {
  projectId: string;
  onBack: () => void;
  onReview: () => void;
}): React.JSX.Element {
  const [project, setProject] = useState<ReviewProject | null>(null);
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [sharePassword, setSharePassword] = useState("");
  const [shareExpiry, setShareExpiry] = useState("");
  const [latestLink, setLatestLink] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const data = await api<{ project: ReviewProject; shares: ShareSummary[] }>(
      `/api/projects/${projectId}`,
    );
    setProject(data.project);
    setShares(data.shares);
  }, [projectId]);

  useEffect(() => {
    void refresh().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : "Could not load project."),
    );
  }, [refresh]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="back-button" type="button" onClick={onBack}>
          ← Projects
        </button>
        <Brand compact />
        <button
          className="primary-button small"
          type="button"
          onClick={onReview}
          disabled={!project?.versions.length}
        >
          Open review
        </button>
      </header>
      <main className="project-setup">
        <section className="setup-heading">
          <div className="eyebrow">Project workspace</div>
          <h1>{project?.title ?? "Loading…"}</h1>
          <p>
            Browser-compatible review copies only. Originals belong in your edit
            storage.
          </p>
        </section>
        {error && <div className="error-banner">{error}</div>}
        <div className="setup-grid">
          <section className="panel upload-panel">
            <div className="panel-number">01</div>
            <div className="panel-heading">
              <h2>Add a version</h2>
              <span>MP4 H.264 or WebM VP8/VP9 · constant frame rate</span>
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (!file) return;
                setBusy("upload");
                setError("");
                const data = new FormData();
                data.append("label", label);
                data.append("file", file);
                try {
                  await api(`/api/projects/${projectId}/versions`, {
                    method: "POST",
                    body: data,
                  });
                  setFile(null);
                  setLabel("");
                  const input =
                    document.querySelector<HTMLInputElement>("#video-upload");
                  if (input) input.value = "";
                  await refresh();
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : "Upload failed.");
                } finally {
                  setBusy("");
                }
              }}
            >
              <label className="drop-zone" htmlFor="video-upload">
                <input
                  id="video-upload"
                  type="file"
                  accept="video/mp4,video/webm,.mp4,.webm"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  required
                />
                <span className="drop-icon" aria-hidden="true">
                  ↑
                </span>
                <strong>{file ? file.name : "Choose a review copy"}</strong>
                <small>
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                    : "The server validates codecs, frame rate, and the real file signature."}
                </small>
              </label>
              <label>
                Version label
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder={`Version ${String((project?.versions.length ?? 0) + 1)}`}
                  maxLength={80}
                />
              </label>
              <button className="primary-button" disabled={!file || busy === "upload"}>
                {busy === "upload" ? "Validating and storing…" : "Add version"}
              </button>
            </form>
          </section>
          <section className="panel share-panel">
            <div className="panel-number">02</div>
            <div className="panel-heading">
              <h2>Create a guest link</h2>
              <span>
                The secret stays in the URL fragment, then becomes an HTTP-only session.
              </span>
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy("share");
                setError("");
                try {
                  const created = await api<{ url: string }>(
                    `/api/projects/${projectId}/shares`,
                    {
                      method: "POST",
                      body: JSON.stringify({
                        ...(sharePassword ? { password: sharePassword } : {}),
                        ...(shareExpiry
                          ? { expiresAt: new Date(shareExpiry).toISOString() }
                          : {}),
                        allowComments: true,
                      }),
                    },
                  );
                  setLatestLink(created.url);
                  setSharePassword("");
                  setShareExpiry("");
                  await refresh();
                } catch (reason) {
                  setError(
                    reason instanceof Error ? reason.message : "Could not create link.",
                  );
                } finally {
                  setBusy("");
                }
              }}
            >
              <label>
                Optional password
                <input
                  type="password"
                  value={sharePassword}
                  onChange={(event) => setSharePassword(event.target.value)}
                  minLength={8}
                  placeholder="At least 8 characters"
                />
              </label>
              <label>
                Optional expiry
                <input
                  type="datetime-local"
                  value={shareExpiry}
                  onChange={(event) => setShareExpiry(event.target.value)}
                />
              </label>
              <button
                className="secondary-button"
                disabled={!project?.versions.length || busy === "share"}
              >
                {busy === "share" ? "Creating…" : "Create private link"}
              </button>
            </form>
            {latestLink && (
              <div className="share-result" role="status">
                <code>{latestLink}</code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(latestLink)}
                >
                  Copy
                </button>
              </div>
            )}
            <div className="share-list">
              {shares.map((share) => (
                <div className="share-row" key={share.id}>
                  <span
                    className={share.revokedAt ? "status muted-status" : "status live"}
                  >
                    {share.revokedAt ? "Revoked" : "Active"}
                  </span>
                  <span>
                    {share.passwordProtected ? "Password · " : ""}
                    {share.expiresAt
                      ? `expires ${new Date(share.expiresAt).toLocaleString()}`
                      : "no expiry"}
                  </span>
                  {!share.revokedAt && (
                    <button
                      className="text-button danger"
                      type="button"
                      onClick={async () => {
                        await api(`/api/shares/${share.id}/revoke`, { method: "POST" });
                        await refresh();
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
        <section className="version-strip" aria-label="Versions">
          <div className="version-strip-heading">
            <h2>Versions</h2>
            <span>{project?.versions.length ?? 0} stored review copies</span>
          </div>
          {project?.versions.map((version) => (
            <div className="version-row" key={version.id}>
              <span className="version-badge">V{version.ordinal}</span>
              <span>
                <strong>{version.label}</strong>
                <small>
                  {version.width}×{version.height} ·{" "}
                  {(version.fpsNumerator / version.fpsDenominator).toFixed(3)} fps ·{" "}
                  {(version.sizeBytes / 1024 / 1024).toFixed(1)} MB
                </small>
              </span>
              <span className={`decision ${version.status}`}>
                {version.status.replace("_", " ")}
              </span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
