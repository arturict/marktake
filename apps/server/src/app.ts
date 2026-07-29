import { createReadStream, existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { ZodError } from "zod";
import {
  createCommentSchema,
  createProjectSchema,
  createReplySchema,
  createShareSchema,
  decisionSchema,
  framesPerSecond,
  guestExchangeSchema,
  loginSchema,
  mediaTimeToFrame,
  updateCommentStatusSchema,
} from "@marktake/shared";
import type { AppConfig } from "./config.js";
import { MarktakeDatabase, type SessionRow } from "./db.js";
import {
  createMediaTools,
  type MediaTools,
  storeUpload,
  UnsupportedMediaError,
  UploadLimitError,
} from "./media.js";
import {
  hashPassword,
  hashToken,
  randomToken,
  safeEqual,
  verifyPassword,
} from "./security.js";

const sessionCookie = "marktake_session";
const twelveHours = 12 * 60 * 60 * 1_000;
const sevenDays = 7 * 24 * 60 * 60 * 1_000;

type AppDependencies = {
  database?: MarktakeDatabase;
  mediaTools?: MediaTools;
  now?: () => Date;
};

type ProjectParams = { projectId: string };
type VersionParams = { versionId: string };
type CommentParams = { commentId: string };
type ShareParams = { shareId: string };

function setSessionCookie(reply: FastifyReply, token: string, config: AppConfig): void {
  reply.setCookie(sessionCookie, token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: config.secureCookies,
    maxAge: sevenDays / 1_000,
  });
}

function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(sessionCookie, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: config.secureCookies,
  });
}

function getSession(
  request: FastifyRequest,
  database: MarktakeDatabase,
  now: Date,
): SessionRow | null {
  const token = request.cookies[sessionCookie];
  return token ? database.getSession(hashToken(token), now.toISOString()) : null;
}

function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
  database: MarktakeDatabase,
  now: Date,
): SessionRow | null {
  const session = getSession(request, database, now);
  if (!session) {
    void reply.code(401).send({ error: "Authentication required." });
    return null;
  }
  return session;
}

function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  database: MarktakeDatabase,
  now: Date,
): SessionRow | null {
  const session = requireSession(request, reply, database, now);
  if (session && session.kind !== "admin") {
    void reply.code(403).send({ error: "Owner access required." });
    return null;
  }
  return session;
}

function requireWriteAuthorization(
  request: FastifyRequest,
  reply: FastifyReply,
  session: SessionRow,
  config: AppConfig,
): boolean {
  if (request.headers["x-csrf-token"] !== session.csrfToken) {
    void reply.code(403).send({ error: "Invalid CSRF token." });
    return false;
  }
  const origin = request.headers.origin;
  if (origin && origin !== new URL(config.publicUrl).origin) {
    void reply.code(403).send({ error: "Untrusted request origin." });
    return false;
  }
  return true;
}

function createSession(
  database: MarktakeDatabase,
  input: {
    kind: "admin" | "guest";
    displayName: string;
    shareLinkId: string | null;
    now: Date;
  },
): { token: string; csrfToken: string } {
  const token = randomToken();
  const csrfToken = randomToken(24);
  database.createSession({
    id: randomUUID(),
    tokenHash: hashToken(token),
    kind: input.kind,
    shareLinkId: input.shareLinkId,
    displayName: input.displayName,
    csrfToken,
    expiresAt: new Date(
      input.now.getTime() + (input.kind === "admin" ? twelveHours : sevenDays),
    ).toISOString(),
    createdAt: input.now.toISOString(),
  });
  return { token, csrfToken };
}

function parseRange(
  rawRange: string | undefined,
  totalSize: number,
): { start: number; end: number } | null | "invalid" {
  if (!rawRange) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(rawRange.trim());
  if (!match) return "invalid";
  const startRaw = match[1] ?? "";
  const endRaw = match[2] ?? "";
  if (!startRaw && !endRaw) return "invalid";
  let start: number;
  let end: number;
  if (!startRaw) {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : totalSize - 1;
  }
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= totalSize
  ) {
    return "invalid";
  }
  return { start, end: Math.min(end, totalSize - 1) };
}

export async function createApp(
  config: AppConfig,
  dependencies: AppDependencies = {},
): Promise<FastifyInstance> {
  await Promise.all([
    mkdir(config.dataDir, { recursive: true }),
    mkdir(config.storageDir, { recursive: true }),
    mkdir(config.tempDir, { recursive: true }),
  ]);
  const database = dependencies.database ?? new MarktakeDatabase(config.databasePath);
  const mediaTools = dependencies.mediaTools ?? createMediaTools(config);
  const now = dependencies.now ?? (() => new Date());
  const app = Fastify({
    logger:
      config.environment === "test"
        ? false
        : {
            level: config.environment === "production" ? "info" : "debug",
            redact: [
              "req.headers.cookie",
              "req.headers.authorization",
              "req.body.password",
              "req.body.token",
            ],
          },
    bodyLimit: 64 * 1024,
    trustProxy: true,
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: {
      files: 1,
      fields: 4,
      fileSize: config.maxUploadBytes,
      parts: 5,
    },
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        mediaSrc: ["'self'", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" },
  });

  app.addHook("onSend", (_request, reply, payload, done) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    done(null, payload);
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof UploadLimitError) {
      return reply.code(413).send({ error: error.message });
    }
    if (error instanceof UnsupportedMediaError) {
      return reply.code(415).send({ error: error.message });
    }
    if (
      error instanceof ZodError ||
      (typeof error === "object" && error !== null && "validation" in error)
    ) {
      return reply.code(400).send({ error: "Invalid request." });
    }
    app.log.error(error);
    return reply.code(500).send({ error: "Unexpected server error." });
  });

  app.get("/api/health", () => ({
    status: "ok",
    version: "0.1.0",
    storage: "local-filesystem",
    transcoding: false,
  }));

  app.get("/api/session", (request) => {
    const session = getSession(request, database, now());
    return session
      ? {
          authenticated: true,
          kind: session.kind,
          displayName: session.displayName,
          csrfToken: session.csrfToken,
        }
      : { authenticated: false };
  });

  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      if (!safeEqual(body.password, config.adminPassword)) {
        return reply.code(401).send({ error: "Invalid password." });
      }
      const current = now();
      database.deleteExpiredSessions(current.toISOString());
      const session = createSession(database, {
        kind: "admin",
        displayName: "Owner",
        shareLinkId: null,
        now: current,
      });
      setSessionCookie(reply, session.token, config);
      return {
        authenticated: true,
        kind: "admin",
        displayName: "Owner",
        csrfToken: session.csrfToken,
      };
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    const current = now();
    const session = requireSession(request, reply, database, current);
    if (!session || !requireWriteAuthorization(request, reply, session, config)) return;
    const token = request.cookies[sessionCookie];
    if (token) database.deleteSession(hashToken(token));
    clearSessionCookie(reply, config);
    return reply.code(204).send();
  });

  app.post(
    "/api/guest/exchange",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = guestExchangeSchema.parse(request.body);
      const current = now();
      const share = database.findShareByToken(
        hashToken(body.token),
        current.toISOString(),
      );
      if (!share)
        return reply.code(404).send({ error: "Review link is invalid or expired." });
      const passwordHash =
        typeof share.password_hash === "string" ? share.password_hash : null;
      if (
        passwordHash &&
        (!body.password || !(await verifyPassword(body.password, passwordHash)))
      ) {
        return reply.code(401).send({ error: "Review password is incorrect." });
      }
      const session = createSession(database, {
        kind: "guest",
        displayName: body.displayName,
        shareLinkId: share.id,
        now: current,
      });
      setSessionCookie(reply, session.token, config);
      return {
        authenticated: true,
        kind: "guest",
        displayName: body.displayName,
        csrfToken: session.csrfToken,
      };
    },
  );

  app.get("/api/projects", async (request, reply) => {
    if (!requireAdmin(request, reply, database, now())) return;
    return { projects: database.listProjects() };
  });

  app.post("/api/projects", async (request, reply) => {
    const current = now();
    const session = requireAdmin(request, reply, database, current);
    if (!session || !requireWriteAuthorization(request, reply, session, config)) return;
    const body = createProjectSchema.parse(request.body);
    const id = randomUUID();
    database.createProject(id, body.title, current.toISOString());
    return reply.code(201).send({ id, title: body.title });
  });

  app.get<{ Params: ProjectParams }>(
    "/api/projects/:projectId",
    async (request, reply) => {
      const session = requireAdmin(request, reply, database, now());
      if (!session) return;
      const project = database.getReviewProject(request.params.projectId);
      if (!project) return reply.code(404).send({ error: "Project not found." });
      return {
        project,
        shares: database.listShares(request.params.projectId).map((row) => ({
          id: String(row.id),
          expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
          revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
          allowComments: Number(row.allow_comments) === 1,
          passwordProtected: Number(row.password_protected) === 1,
          createdAt: String(row.created_at),
        })),
      };
    },
  );

  app.post<{ Params: ProjectParams }>(
    "/api/projects/:projectId/shares",
    async (request, reply) => {
      const current = now();
      const session = requireAdmin(request, reply, database, current);
      if (!session || !requireWriteAuthorization(request, reply, session, config))
        return;
      if (!database.projectExists(request.params.projectId)) {
        return reply.code(404).send({ error: "Project not found." });
      }
      const body = createShareSchema.parse(request.body ?? {});
      if (body.expiresAt && new Date(body.expiresAt) <= current) {
        return reply.code(400).send({ error: "Expiry must be in the future." });
      }
      const token = randomToken();
      const id = randomUUID();
      database.createShare({
        id,
        projectId: request.params.projectId,
        tokenHash: hashToken(token),
        passwordHash: body.password ? await hashPassword(body.password) : null,
        expiresAt: body.expiresAt ?? null,
        allowComments: body.allowComments,
        createdAt: current.toISOString(),
      });
      return reply.code(201).send({
        id,
        url: `${config.publicUrl}/#/review/${token}`,
        expiresAt: body.expiresAt ?? null,
        passwordProtected: Boolean(body.password),
      });
    },
  );

  app.post<{ Params: ShareParams }>(
    "/api/shares/:shareId/revoke",
    async (request, reply) => {
      const current = now();
      const session = requireAdmin(request, reply, database, current);
      if (!session || !requireWriteAuthorization(request, reply, session, config))
        return;
      if (!database.revokeShare(request.params.shareId, current.toISOString())) {
        return reply.code(404).send({ error: "Active share link not found." });
      }
      return reply.code(204).send();
    },
  );

  app.post<{ Params: ProjectParams }>(
    "/api/projects/:projectId/versions",
    async (request, reply) => {
      const current = now();
      const session = requireAdmin(request, reply, database, current);
      if (!session || !requireWriteAuthorization(request, reply, session, config))
        return;
      if (!database.projectExists(request.params.projectId)) {
        return reply.code(404).send({ error: "Project not found." });
      }
      const part = await request.file();
      if (!part) return reply.code(400).send({ error: "A video file is required." });
      const stored = await storeUpload({
        source: part.file,
        filename: part.filename,
        config,
        mediaTools,
        existingStorageBytes: database.storageBytes(),
      });
      if (part.file.truncated) {
        await rm(path.join(config.storageDir, stored.storedName), { force: true });
        return reply
          .code(413)
          .send({ error: "Upload exceeded the configured file limit." });
      }
      const ordinal = database.nextOrdinal(request.params.projectId);
      const id = randomUUID();
      const labelField = part.fields.label;
      const label =
        labelField && "value" in labelField
          ? String(labelField.value).trim().slice(0, 80)
          : `Version ${String(ordinal)}`;
      database.createVersion({
        id,
        projectId: request.params.projectId,
        ordinal,
        label: label || `Version ${String(ordinal)}`,
        ...stored,
        createdAt: current.toISOString(),
      });
      return reply.code(201).send({ id, ordinal, ...stored });
    },
  );

  app.get<{ Querystring: { projectId?: string } }>(
    "/api/review",
    async (request, reply) => {
      const session = requireSession(request, reply, database, now());
      if (!session) return;
      const projectId =
        session.kind === "admin" ? request.query.projectId : session.projectId;
      if (!projectId || !database.canAccessProject(session, projectId)) {
        return reply.code(403).send({ error: "Project access denied." });
      }
      const project = database.getReviewProject(projectId);
      if (!project) return reply.code(404).send({ error: "Project not found." });
      return {
        project,
        capabilities: {
          canComment: session.allowComments,
          canResolve: session.kind === "admin",
          canShare: session.kind === "admin",
        },
      };
    },
  );

  app.get<{ Params: VersionParams }>(
    "/api/versions/:versionId/media",
    async (request, reply) => {
      const session = requireSession(request, reply, database, now());
      if (!session) return;
      if (!database.canAccessVersion(session, request.params.versionId)) {
        return reply.code(404).send({ error: "Video not found." });
      }
      const media = database.getMedia(request.params.versionId);
      if (!media) return reply.code(404).send({ error: "Video not found." });
      const filePath = path.join(config.storageDir, String(media.stored_name));
      const fileStat = await stat(filePath);
      const range = parseRange(request.headers.range, fileStat.size);
      reply.header("Accept-Ranges", "bytes");
      reply.header("Content-Type", String(media.mime));
      reply.header("Content-Disposition", "inline");
      reply.header("Cache-Control", "private, max-age=0, must-revalidate");
      if (range === "invalid") {
        reply.header("Content-Range", `bytes */${String(fileStat.size)}`);
        return reply.code(416).send();
      }
      if (!range) {
        reply.header("Content-Length", fileStat.size);
        return reply.send(createReadStream(filePath));
      }
      reply.code(206);
      reply.header("Content-Length", range.end - range.start + 1);
      reply.header(
        "Content-Range",
        `bytes ${String(range.start)}-${String(range.end)}/${String(fileStat.size)}`,
      );
      return reply.send(createReadStream(filePath, range));
    },
  );

  app.post<{ Params: VersionParams }>(
    "/api/versions/:versionId/comments",
    async (request, reply) => {
      const current = now();
      const session = requireSession(request, reply, database, current);
      if (
        !session ||
        !requireWriteAuthorization(request, reply, session, config) ||
        !session.allowComments
      ) {
        if (session && !session.allowComments) {
          return reply.code(403).send({ error: "This link is read-only." });
        }
        return;
      }
      if (!database.canAccessVersion(session, request.params.versionId)) {
        return reply.code(404).send({ error: "Version not found." });
      }
      const body = createCommentSchema.parse(request.body);
      const timing = database.getVersionTiming(request.params.versionId);
      if (!timing) return reply.code(404).send({ error: "Version not found." });
      const maxFrame = Math.ceil(
        (timing.durationMs / 1_000) *
          framesPerSecond({
            numerator: timing.fpsNumerator,
            denominator: timing.fpsDenominator,
          }),
      );
      const rate = {
        numerator: timing.fpsNumerator,
        denominator: timing.fpsDenominator,
      };
      const expectedFrame = Math.min(
        maxFrame - 1,
        mediaTimeToFrame(body.timeMs / 1_000, rate),
      );
      if (
        body.timeMs > timing.durationMs ||
        body.frameNumber >= maxFrame ||
        body.frameNumber !== expectedFrame
      ) {
        return reply.code(400).send({ error: "Comment time is outside this video." });
      }
      const id = randomUUID();
      database.createComment({
        id,
        versionId: request.params.versionId,
        parentId: null,
        authorName: session.displayName,
        body: body.body,
        frameNumber: body.frameNumber,
        timeMs: body.timeMs,
        annotationJson: JSON.stringify(body.annotations),
        now: current.toISOString(),
      });
      return reply.code(201).send({ id });
    },
  );

  app.post<{ Params: CommentParams }>(
    "/api/comments/:commentId/replies",
    async (request, reply) => {
      const current = now();
      const session = requireSession(request, reply, database, current);
      if (
        !session ||
        !requireWriteAuthorization(request, reply, session, config) ||
        !session.allowComments
      ) {
        if (session && !session.allowComments) {
          return reply.code(403).send({ error: "This link is read-only." });
        }
        return;
      }
      const parent = database.getComment(request.params.commentId);
      if (
        !parent ||
        !database.canAccessProject(session, String(parent.project_id)) ||
        parent.parent_id
      ) {
        return reply.code(404).send({ error: "Comment not found." });
      }
      const body = createReplySchema.parse(request.body);
      const id = randomUUID();
      database.createComment({
        id,
        versionId: String(parent.version_id),
        parentId: request.params.commentId,
        authorName: session.displayName,
        body: body.body,
        frameNumber: Number(parent.frame_number),
        timeMs: Number(parent.time_ms),
        annotationJson: "[]",
        now: current.toISOString(),
      });
      return reply.code(201).send({ id });
    },
  );

  app.patch<{ Params: CommentParams }>(
    "/api/comments/:commentId/status",
    async (request, reply) => {
      const current = now();
      const session = requireAdmin(request, reply, database, current);
      if (!session || !requireWriteAuthorization(request, reply, session, config))
        return;
      const body = updateCommentStatusSchema.parse(request.body);
      if (
        !database.updateCommentStatus(
          request.params.commentId,
          body.status,
          current.toISOString(),
        )
      ) {
        return reply.code(404).send({ error: "Comment not found." });
      }
      return reply.code(204).send();
    },
  );

  app.post<{ Params: VersionParams }>(
    "/api/versions/:versionId/decision",
    async (request, reply) => {
      const current = now();
      const session = requireSession(request, reply, database, current);
      if (!session || !requireWriteAuthorization(request, reply, session, config))
        return;
      if (!database.canAccessVersion(session, request.params.versionId)) {
        return reply.code(404).send({ error: "Version not found." });
      }
      const body = decisionSchema.parse(request.body);
      database.createDecision({
        id: randomUUID(),
        versionId: request.params.versionId,
        reviewerName: session.displayName,
        decision: body.decision,
        now: current.toISOString(),
      });
      return reply.code(201).send({ status: body.decision });
    },
  );

  if (existsSync(config.webDist)) {
    await app.register(staticPlugin, {
      root: config.webDist,
      prefix: "/",
      wildcard: false,
      setHeaders(response, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          response.header("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    });
    app.get("/*", (_request, reply) => reply.sendFile("index.html"));
  } else {
    app.get("/", (_request, reply) =>
      reply
        .code(503)
        .type("text/plain")
        .send("Marktake web build not found. Run pnpm build."),
    );
  }

  app.addHook("onClose", () => {
    if (!dependencies.database) database.close();
  });
  return app;
}

export { parseRange };
