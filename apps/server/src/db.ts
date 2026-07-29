import { DatabaseSync } from "node:sqlite";
import type {
  Annotation,
  ReviewComment,
  ReviewProject,
  ReviewVersion,
} from "@marktake/shared";

type DbRow = Record<string, unknown>;

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export type SessionRow = {
  id: string;
  kind: "admin" | "guest";
  shareLinkId: string | null;
  displayName: string;
  csrfToken: string;
  expiresAt: string;
  projectId: string | null;
  allowComments: boolean;
};

export class MarktakeDatabase {
  readonly raw: DatabaseSync;

  constructor(databasePath: string) {
    this.raw = new DatabaseSync(databasePath);
    this.raw.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    this.migrate();
  }

  close(): void {
    this.raw.close();
  }

  migrate(): void {
    this.raw.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL CHECK(ordinal > 0),
        label TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL UNIQUE,
        mime TEXT NOT NULL CHECK(mime IN ('video/mp4', 'video/webm')),
        size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
        duration_ms INTEGER NOT NULL CHECK(duration_ms > 0),
        fps_num INTEGER NOT NULL CHECK(fps_num > 0),
        fps_den INTEGER NOT NULL CHECK(fps_den > 0),
        width INTEGER NOT NULL CHECK(width > 0),
        height INTEGER NOT NULL CHECK(height > 0),
        status TEXT NOT NULL DEFAULT 'in_review'
          CHECK(status IN ('in_review', 'approved', 'changes_requested')),
        created_at TEXT NOT NULL,
        UNIQUE(project_id, ordinal)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS share_links (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        expires_at TEXT,
        revoked_at TEXT,
        allow_comments INTEGER NOT NULL DEFAULT 1 CHECK(allow_comments IN (0, 1)),
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK(kind IN ('admin', 'guest')),
        share_link_id TEXT REFERENCES share_links(id) ON DELETE CASCADE,
        display_name TEXT NOT NULL,
        csrf_token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL,
        body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
        frame_number INTEGER NOT NULL CHECK(frame_number >= 0),
        time_ms INTEGER NOT NULL CHECK(time_ms >= 0),
        annotation_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
        reviewer_name TEXT NOT NULL,
        decision TEXT NOT NULL CHECK(decision IN ('approved', 'changes_requested')),
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_versions_project ON versions(project_id, ordinal);
      CREATE INDEX IF NOT EXISTS idx_shares_project ON share_links(project_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_comments_version ON comments(version_id, created_at);
    `);
  }

  private transaction<T>(operation: () => T): T {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.raw.exec("COMMIT");
      return result;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }

  getSession(tokenHash: string, now: string): SessionRow | null {
    const row = this.raw
      .prepare(
        `SELECT s.id, s.kind, s.share_link_id, s.display_name, s.csrf_token,
                s.expires_at, l.project_id, l.allow_comments
         FROM sessions s
         LEFT JOIN share_links l ON l.id = s.share_link_id
         WHERE s.token_hash = ? AND s.expires_at > ?
           AND (s.kind = 'admin' OR (l.revoked_at IS NULL
             AND (l.expires_at IS NULL OR l.expires_at > ?)))`,
      )
      .get(tokenHash, now, now) as DbRow | undefined;
    return row
      ? {
          id: String(row.id),
          kind: row.kind as "admin" | "guest",
          shareLinkId: nullableString(row.share_link_id),
          displayName: String(row.display_name),
          csrfToken: String(row.csrf_token),
          expiresAt: String(row.expires_at),
          projectId: nullableString(row.project_id),
          allowComments: row.kind === "admin" || Number(row.allow_comments) === 1,
        }
      : null;
  }

  createSession(input: {
    id: string;
    tokenHash: string;
    kind: "admin" | "guest";
    shareLinkId: string | null;
    displayName: string;
    csrfToken: string;
    expiresAt: string;
    createdAt: string;
  }): void {
    this.raw
      .prepare(
        `INSERT INTO sessions
          (id, token_hash, kind, share_link_id, display_name, csrf_token, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.tokenHash,
        input.kind,
        input.shareLinkId,
        input.displayName,
        input.csrfToken,
        input.expiresAt,
        input.createdAt,
      );
  }

  deleteSession(tokenHash: string): void {
    this.raw.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  deleteExpiredSessions(now: string): void {
    this.raw.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  }

  findShareByToken(tokenHash: string, now: string): (DbRow & { id: string }) | null {
    const row = this.raw
      .prepare(
        `SELECT * FROM share_links
         WHERE token_hash = ? AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .get(tokenHash, now) as DbRow | undefined;
    return row ? ({ ...row, id: String(row.id) } as DbRow & { id: string }) : null;
  }

  listProjects(): {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    versionCount: number;
  }[] {
    return (
      this.raw
        .prepare(
          `SELECT p.id, p.title, p.created_at, p.updated_at, count(v.id) AS version_count
           FROM projects p LEFT JOIN versions v ON v.project_id = p.id
           GROUP BY p.id ORDER BY p.updated_at DESC`,
        )
        .all() as DbRow[]
    ).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      versionCount: Number(row.version_count),
    }));
  }

  createProject(id: string, title: string, now: string): void {
    this.raw
      .prepare(
        "INSERT INTO projects (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(id, title, now, now);
  }

  projectExists(id: string): boolean {
    return Boolean(this.raw.prepare("SELECT 1 FROM projects WHERE id = ?").get(id));
  }

  nextOrdinal(projectId: string): number {
    const row = this.raw
      .prepare(
        "SELECT coalesce(max(ordinal), 0) + 1 AS ordinal FROM versions WHERE project_id = ?",
      )
      .get(projectId) as DbRow;
    return Number(row.ordinal);
  }

  createVersion(input: {
    id: string;
    projectId: string;
    ordinal: number;
    label: string;
    originalName: string;
    storedName: string;
    mime: "video/mp4" | "video/webm";
    sizeBytes: number;
    durationMs: number;
    fpsNumerator: number;
    fpsDenominator: number;
    width: number;
    height: number;
    createdAt: string;
  }): void {
    this.transaction(() => {
      this.raw
        .prepare(
          `INSERT INTO versions
            (id, project_id, ordinal, label, original_name, stored_name, mime, size_bytes,
             duration_ms, fps_num, fps_den, width, height, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.id,
          input.projectId,
          input.ordinal,
          input.label,
          input.originalName,
          input.storedName,
          input.mime,
          input.sizeBytes,
          input.durationMs,
          input.fpsNumerator,
          input.fpsDenominator,
          input.width,
          input.height,
          input.createdAt,
        );
      this.raw
        .prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
        .run(input.createdAt, input.projectId);
    });
  }

  storageBytes(): number {
    const row = this.raw
      .prepare("SELECT coalesce(sum(size_bytes), 0) AS total FROM versions")
      .get() as DbRow;
    return Number(row.total);
  }

  createShare(input: {
    id: string;
    projectId: string;
    tokenHash: string;
    passwordHash: string | null;
    expiresAt: string | null;
    allowComments: boolean;
    createdAt: string;
  }): void {
    this.raw
      .prepare(
        `INSERT INTO share_links
          (id, project_id, token_hash, password_hash, expires_at, allow_comments, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.projectId,
        input.tokenHash,
        input.passwordHash,
        input.expiresAt,
        input.allowComments ? 1 : 0,
        input.createdAt,
      );
  }

  listShares(projectId: string): DbRow[] {
    return this.raw
      .prepare(
        `SELECT id, expires_at, revoked_at, allow_comments, created_at,
                password_hash IS NOT NULL AS password_protected
         FROM share_links WHERE project_id = ? ORDER BY created_at DESC`,
      )
      .all(projectId) as DbRow[];
  }

  revokeShare(id: string, now: string): boolean {
    const result = this.raw
      .prepare(
        "UPDATE share_links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
      )
      .run(now, id);
    return result.changes > 0;
  }

  canAccessProject(session: SessionRow, projectId: string): boolean {
    return session.kind === "admin" || session.projectId === projectId;
  }

  canAccessVersion(session: SessionRow, versionId: string): boolean {
    if (session.kind === "admin") {
      return Boolean(
        this.raw.prepare("SELECT 1 FROM versions WHERE id = ?").get(versionId),
      );
    }
    return Boolean(
      this.raw
        .prepare(`SELECT 1 FROM versions WHERE id = ? AND project_id = ?`)
        .get(versionId, session.projectId),
    );
  }

  getMedia(versionId: string): DbRow | null {
    const row = this.raw
      .prepare(
        `SELECT id, project_id, stored_name, mime, size_bytes FROM versions WHERE id = ?`,
      )
      .get(versionId) as DbRow | undefined;
    return row ?? null;
  }

  getVersionTiming(versionId: string): {
    projectId: string;
    durationMs: number;
    fpsNumerator: number;
    fpsDenominator: number;
  } | null {
    const row = this.raw
      .prepare(
        "SELECT project_id, duration_ms, fps_num, fps_den FROM versions WHERE id = ?",
      )
      .get(versionId) as DbRow | undefined;
    return row
      ? {
          projectId: String(row.project_id),
          durationMs: Number(row.duration_ms),
          fpsNumerator: Number(row.fps_num),
          fpsDenominator: Number(row.fps_den),
        }
      : null;
  }

  getReviewProject(projectId: string): ReviewProject | null {
    const project = this.raw
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId) as DbRow | undefined;
    if (!project) return null;
    const versionRows = this.raw
      .prepare("SELECT * FROM versions WHERE project_id = ? ORDER BY ordinal DESC")
      .all(projectId) as DbRow[];
    const versions = versionRows.map((row): ReviewVersion => {
      const comments = this.commentsForVersion(String(row.id));
      return {
        id: String(row.id),
        ordinal: Number(row.ordinal),
        label: String(row.label),
        originalName: String(row.original_name),
        mime: row.mime as "video/mp4" | "video/webm",
        sizeBytes: Number(row.size_bytes),
        durationMs: Number(row.duration_ms),
        fpsNumerator: Number(row.fps_num),
        fpsDenominator: Number(row.fps_den),
        width: Number(row.width),
        height: Number(row.height),
        status: row.status as "in_review" | "approved" | "changes_requested",
        createdAt: String(row.created_at),
        mediaUrl: `/api/versions/${String(row.id)}/media`,
        comments,
      };
    });
    return {
      id: String(project.id),
      title: String(project.title),
      createdAt: String(project.created_at),
      updatedAt: String(project.updated_at),
      versions,
    };
  }

  private commentsForVersion(versionId: string): ReviewComment[] {
    const rows = this.raw
      .prepare("SELECT * FROM comments WHERE version_id = ? ORDER BY created_at ASC")
      .all(versionId) as DbRow[];
    const byId = new Map<string, ReviewComment>();
    const roots: ReviewComment[] = [];
    for (const row of rows) {
      const comment: ReviewComment = {
        id: String(row.id),
        versionId: String(row.version_id),
        parentId: nullableString(row.parent_id),
        authorName: String(row.author_name),
        body: String(row.body),
        frameNumber: Number(row.frame_number),
        timeMs: Number(row.time_ms),
        annotations: JSON.parse(String(row.annotation_json)) as Annotation[],
        status: row.status as "open" | "resolved",
        createdAt: String(row.created_at),
        replies: [],
      };
      byId.set(comment.id, comment);
      if (!comment.parentId) roots.push(comment);
    }
    for (const comment of byId.values()) {
      if (comment.parentId) byId.get(comment.parentId)?.replies.push(comment);
    }
    return roots;
  }

  createComment(input: {
    id: string;
    versionId: string;
    parentId: string | null;
    authorName: string;
    body: string;
    frameNumber: number;
    timeMs: number;
    annotationJson: string;
    now: string;
  }): void {
    this.raw
      .prepare(
        `INSERT INTO comments
          (id, version_id, parent_id, author_name, body, frame_number, time_ms,
           annotation_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.versionId,
        input.parentId,
        input.authorName,
        input.body,
        input.frameNumber,
        input.timeMs,
        input.annotationJson,
        input.now,
        input.now,
      );
  }

  getComment(id: string): DbRow | null {
    return (
      (this.raw
        .prepare(
          `SELECT c.*, v.project_id FROM comments c
           JOIN versions v ON v.id = c.version_id WHERE c.id = ?`,
        )
        .get(id) as DbRow | undefined) ?? null
    );
  }

  updateCommentStatus(id: string, status: "open" | "resolved", now: string): boolean {
    return (
      this.raw
        .prepare(
          "UPDATE comments SET status = ?, updated_at = ? WHERE id = ? AND parent_id IS NULL",
        )
        .run(status, now, id).changes > 0
    );
  }

  createDecision(input: {
    id: string;
    versionId: string;
    reviewerName: string;
    decision: "approved" | "changes_requested";
    now: string;
  }): void {
    this.transaction(() => {
      this.raw
        .prepare(
          "INSERT INTO decisions (id, version_id, reviewer_name, decision, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(input.id, input.versionId, input.reviewerName, input.decision, input.now);
      this.raw
        .prepare("UPDATE versions SET status = ? WHERE id = ?")
        .run(input.decision, input.versionId);
    });
  }
}
