import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "./config.js";
import { MarktakeDatabase } from "./db.js";
import { createApp } from "./app.js";

type TestContext = {
  app: FastifyInstance;
  config: AppConfig;
  database: MarktakeDatabase;
  directory: string;
};

type Auth = {
  cookie: string;
  csrf: string;
};

const contexts: TestContext[] = [];
const now = new Date("2026-07-29T10:00:00.000Z");

function responseCookie(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("Expected a session cookie.");
  return value.split(";")[0] ?? value;
}

async function createContext(): Promise<TestContext> {
  const directory = await mkdtemp(path.join(tmpdir(), "marktake-app-test-"));
  const config: AppConfig = {
    adminPassword: "owner-test-password",
    publicUrl: "http://marktake.test",
    dataDir: directory,
    databasePath: path.join(directory, "marktake.sqlite"),
    storageDir: path.join(directory, "media"),
    tempDir: path.join(directory, "tmp"),
    maxUploadBytes: 1024 * 1024,
    maxStorageBytes: 10 * 1024 * 1024,
    secureCookies: false,
    ffprobePath: "ffprobe",
    ffmpegPath: "ffmpeg",
    webDist: path.join(directory, "missing-web"),
    host: "127.0.0.1",
    port: 0,
    environment: "test",
  };
  await Promise.all([
    mkdir(config.storageDir, { recursive: true }),
    mkdir(config.tempDir, { recursive: true }),
  ]);
  const database = new MarktakeDatabase(config.databasePath);
  for (const project of [
    { id: "project-a", title: "Launch cut", version: "version-a", file: "a.mp4" },
    {
      id: "project-b",
      title: "Private second cut",
      version: "version-b",
      file: "b.mp4",
    },
  ]) {
    database.createProject(project.id, project.title, now.toISOString());
    database.createVersion({
      id: project.version,
      projectId: project.id,
      ordinal: 1,
      label: "Version 1",
      originalName: project.file,
      storedName: project.file,
      mime: "video/mp4",
      sizeBytes: 16,
      durationMs: 10_000,
      fpsNumerator: 24,
      fpsDenominator: 1,
      width: 1280,
      height: 720,
      createdAt: now.toISOString(),
    });
    await writeFile(path.join(config.storageDir, project.file), Buffer.alloc(16, 7));
  }
  const app = await createApp(config, { database, now: () => now });
  const context = { app, config, database, directory };
  contexts.push(context);
  return context;
}

async function login(app: FastifyInstance): Promise<Auth> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { password: "owner-test-password" },
  });
  expect(response.statusCode).toBe(200);
  const body = response.json<{ csrfToken: string }>();
  return {
    cookie: responseCookie(response.headers["set-cookie"]),
    csrf: body.csrfToken,
  };
}

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map(async ({ app, database, directory }) => {
      await app.close();
      database.close();
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("HTTP security boundaries", () => {
  it("requires owner authentication, CSRF, and a trusted origin for writes", async () => {
    const { app } = await createContext();
    const unauthenticated = await app.inject({ method: "GET", url: "/api/projects" });
    expect(unauthenticated.statusCode).toBe(401);

    const wrongPassword = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "wrong" },
    });
    expect(wrongPassword.statusCode).toBe(401);

    const auth = await login(app);
    const missingCsrf = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: auth.cookie },
      payload: { title: "No CSRF" },
    });
    expect(missingCsrf.statusCode).toBe(403);

    const hostileOrigin = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrf,
        origin: "https://attacker.invalid",
      },
      payload: { title: "Hostile origin" },
    });
    expect(hostileOrigin.statusCode).toBe(403);

    const accepted = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrf,
        origin: "http://marktake.test",
      },
      payload: { title: "Accepted project" },
    });
    expect(accepted.statusCode).toBe(201);
  });

  it("keeps guest secrets in the URL fragment, stores only a hash, and enforces IDOR scope", async () => {
    const { app, database } = await createContext();
    const owner = await login(app);
    const shareResponse = await app.inject({
      method: "POST",
      url: "/api/projects/project-a/shares",
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: { allowComments: true },
    });
    expect(shareResponse.statusCode).toBe(201);
    const share = shareResponse.json<{ id: string; url: string }>();
    expect(share.url).toMatch(/^http:\/\/marktake\.test\/#\/review\/[\w-]+$/u);
    const secret = share.url.split("/").at(-1);
    expect(secret).toBeTruthy();
    const stored = database.raw
      .prepare("SELECT token_hash FROM share_links WHERE id = ?")
      .get(share.id) as { token_hash: string };
    expect(stored.token_hash).not.toBe(secret);
    expect(stored.token_hash).toHaveLength(64);

    const exchange = await app.inject({
      method: "POST",
      url: "/api/guest/exchange",
      payload: { token: secret, displayName: "Guest reviewer" },
    });
    expect(exchange.statusCode).toBe(200);
    const guest = {
      cookie: responseCookie(exchange.headers["set-cookie"]),
      csrf: exchange.json<{ csrfToken: string }>().csrfToken,
    };

    const scopedReview = await app.inject({
      method: "GET",
      url: "/api/review?projectId=project-b",
      headers: { cookie: guest.cookie },
    });
    expect(scopedReview.statusCode).toBe(200);
    expect(scopedReview.json<{ project: { id: string } }>().project.id).toBe(
      "project-a",
    );

    const otherMedia = await app.inject({
      method: "GET",
      url: "/api/versions/version-b/media",
      headers: { cookie: guest.cookie },
    });
    expect(otherMedia.statusCode).toBe(404);

    const revoke = await app.inject({
      method: "POST",
      url: `/api/shares/${share.id}/revoke`,
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
    });
    expect(revoke.statusCode).toBe(204);
    const afterRevoke = await app.inject({
      method: "GET",
      url: "/api/review",
      headers: { cookie: guest.cookie },
    });
    expect(afterRevoke.statusCode).toBe(401);
  });

  it("rejects false timecode assignments and preserves comment markup only as data", async () => {
    const { app } = await createContext();
    const owner = await login(app);

    const mismatched = await app.inject({
      method: "POST",
      url: "/api/versions/version-a/comments",
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: {
        body: "Wrong frame",
        frameNumber: 99,
        timeMs: 1250,
        annotations: [],
      },
    });
    expect(mismatched.statusCode).toBe(400);

    const outOfBoundsAnnotation = await app.inject({
      method: "POST",
      url: "/api/versions/version-a/comments",
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: {
        body: "Bad pin",
        frameNumber: 30,
        timeMs: 1250,
        annotations: [{ tool: "pin", x: 4, y: 0.5 }],
      },
    });
    expect(outOfBoundsAnnotation.statusCode).toBe(400);

    const xssText = "<img src=x onerror=alert(1)> Keep this as plain review text.";
    const accepted = await app.inject({
      method: "POST",
      url: "/api/versions/version-a/comments",
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: {
        body: xssText,
        frameNumber: 30,
        timeMs: 1250,
        annotations: [{ tool: "pin", x: 0.25, y: 0.5 }],
      },
    });
    expect(accepted.statusCode).toBe(201);
    const commentId = accepted.json<{ id: string }>().id;

    const reply = await app.inject({
      method: "POST",
      url: `/api/comments/${commentId}/replies`,
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: { body: "Owner follow-up" },
    });
    expect(reply.statusCode).toBe(201);

    const resolved = await app.inject({
      method: "PATCH",
      url: `/api/comments/${commentId}/status`,
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: { status: "resolved" },
    });
    expect(resolved.statusCode).toBe(204);

    const approved = await app.inject({
      method: "POST",
      url: "/api/versions/version-a/decision",
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: { decision: "approved" },
    });
    expect(approved.statusCode).toBe(201);

    const missingVersion = await app.inject({
      method: "POST",
      url: "/api/versions/not-found/decision",
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: { decision: "approved" },
    });
    expect(missingVersion.statusCode).toBe(404);

    const review = await app.inject({
      method: "GET",
      url: "/api/review?projectId=project-a",
      headers: { cookie: owner.cookie },
    });
    expect(review.statusCode).toBe(200);
    const comments = review.json<{
      project: {
        versions: {
          comments: {
            body: string;
            status: string;
            replies: { body: string }[];
          }[];
        }[];
      };
    }>().project.versions[0]?.comments;
    expect(comments?.[0]?.body).toBe(xssText);
    expect(comments?.[0]?.status).toBe("resolved");
    expect(comments?.[0]?.replies[0]?.body).toBe("Owner follow-up");

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.headers["content-security-policy"]).toContain("script-src 'self'");
  });

  it("serves authenticated byte ranges and rejects invalid ranges", async () => {
    const { app } = await createContext();
    const owner = await login(app);

    const partial = await app.inject({
      method: "GET",
      url: "/api/versions/version-a/media",
      headers: { cookie: owner.cookie, range: "bytes=4-7" },
    });
    expect(partial.statusCode).toBe(206);
    expect(partial.headers["content-range"]).toBe("bytes 4-7/16");
    expect(partial.rawPayload).toHaveLength(4);

    const invalid = await app.inject({
      method: "GET",
      url: "/api/versions/version-a/media",
      headers: { cookie: owner.cookie, range: "bytes=99-100" },
    });
    expect(invalid.statusCode).toBe(416);
    expect(invalid.headers["content-range"]).toBe("bytes */16");
  });
});
