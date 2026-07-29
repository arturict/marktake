import { createReadStream } from "node:fs";
import { copyFile, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import {
  type MediaTools,
  storeUpload,
  UnsupportedMediaError,
  UploadLimitError,
  validateProbe,
} from "./media.js";

const temporaryDirectories: string[] = [];

async function createTestConfig(
  overrides: Partial<AppConfig> = {},
): Promise<AppConfig> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "marktake-media-test-"));
  temporaryDirectories.push(dataDir);
  return {
    adminPassword: "local-test-password",
    publicUrl: "http://localhost:4180",
    dataDir,
    databasePath: path.join(dataDir, "marktake.sqlite"),
    storageDir: path.join(dataDir, "media"),
    tempDir: path.join(dataDir, "tmp"),
    maxUploadBytes: 1024,
    maxStorageBytes: 4096,
    secureCookies: false,
    ffprobePath: "ffprobe",
    ffmpegPath: "ffmpeg",
    webDist: path.join(dataDir, "missing-web"),
    host: "127.0.0.1",
    port: 0,
    environment: "test",
    ...overrides,
  };
}

function mp4Bytes(payloadSize = 32): Buffer {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftypmp42", "ascii"),
    Buffer.alloc(payloadSize, 1),
  ]);
}

function validProbe(videoCodec = "h264") {
  return {
    streams: [
      {
        codec_type: "video",
        codec_name: videoCodec,
        width: 1920,
        height: 1080,
        r_frame_rate: "30000/1001",
        avg_frame_rate: "30000/1001",
      },
      { codec_type: "audio", codec_name: "aac" },
    ],
    format: { duration: "12.5" },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("probe validation", () => {
  it("accepts a constant-frame-rate browser-safe MP4", () => {
    expect(validateProbe(validProbe(), "video/mp4")).toEqual({
      mime: "video/mp4",
      durationMs: 12_500,
      fpsNumerator: 30_000,
      fpsDenominator: 1001,
      width: 1920,
      height: 1080,
    });
  });

  it.each([
    ["wrong codec", validProbe("hevc")],
    [
      "variable frame rate",
      {
        ...validProbe(),
        streams: [
          {
            ...validProbe().streams[0],
            r_frame_rate: "60/1",
            avg_frame_rate: "24/1",
          },
        ],
      },
    ],
    ["missing duration", { ...validProbe(), format: {} }],
  ])("rejects manipulated probe data: %s", (_label, probe) => {
    expect(() => validateProbe(probe, "video/mp4")).toThrow(UnsupportedMediaError);
  });
});

describe("upload storage", () => {
  it("stores a validated copy under a generated name and normalizes metadata", async () => {
    const config = await createTestConfig();
    const mediaTools: MediaTools = {
      inspect: vi.fn(() =>
        Promise.resolve({
          mime: "video/mp4" as const,
          durationMs: 1000,
          fpsNumerator: 24,
          fpsDenominator: 1,
          width: 1280,
          height: 720,
        }),
      ),
      remux: vi.fn(async (source, destination) => {
        await copyFile(source, destination);
      }),
    };

    const stored = await storeUpload({
      source: Readable.from(mp4Bytes()),
      filename: "../../bad\u0000<title>.mp4",
      config,
      mediaTools,
      existingStorageBytes: 0,
    });

    expect(stored.originalName).toBe("bad_title_.mp4");
    expect(stored.storedName).toMatch(/^[\da-f-]+\.mp4$/u);
    expect(stored.sizeBytes).toBeGreaterThan(0);
    expect(await readdir(config.tempDir)).toEqual([]);
    expect(await readdir(config.storageDir)).toEqual([stored.storedName]);
  });

  it("rejects spoofed file extensions before invoking media tools", async () => {
    const config = await createTestConfig();
    const inspect = vi.fn();
    const mediaTools: MediaTools = {
      inspect,
      remux: vi.fn(),
    };

    await expect(
      storeUpload({
        source: Readable.from(Buffer.from("<script>alert(1)</script>")),
        filename: "attack.mp4",
        config,
        mediaTools,
        existingStorageBytes: 0,
      }),
    ).rejects.toThrow(UnsupportedMediaError);
    expect(inspect).not.toHaveBeenCalled();
    expect(await readdir(config.tempDir)).toEqual([]);
  });

  it("stops oversized uploads and removes partial temporary files", async () => {
    const config = await createTestConfig({ maxUploadBytes: 16 });
    const mediaTools: MediaTools = { inspect: vi.fn(), remux: vi.fn() };

    await expect(
      storeUpload({
        source: Readable.from(mp4Bytes(128)),
        filename: "large.mp4",
        config,
        mediaTools,
        existingStorageBytes: 0,
      }),
    ).rejects.toThrow(UploadLimitError);
    expect(await readdir(config.tempDir)).toEqual([]);
    expect(await readdir(config.storageDir)).toEqual([]);
  });

  it("cleans up an interrupted upload stream", async () => {
    const config = await createTestConfig();
    const fixturePath = path.join(config.dataDir, "partial.mp4");
    await writeFile(fixturePath, mp4Bytes(512));
    const source = createReadStream(fixturePath, { highWaterMark: 16 });
    source.once("data", () => source.destroy(new Error("connection interrupted")));

    await expect(
      storeUpload({
        source,
        filename: "interrupted.mp4",
        config,
        mediaTools: { inspect: vi.fn(), remux: vi.fn() },
        existingStorageBytes: 0,
      }),
    ).rejects.toThrow("connection interrupted");
    expect(await readdir(config.tempDir)).toEqual([]);
    expect(await readdir(config.storageDir)).toEqual([]);
  });

  it("removes a remuxed file that would exceed the total storage cap", async () => {
    const config = await createTestConfig({ maxStorageBytes: 128 });
    const mediaTools: MediaTools = {
      inspect: vi.fn(() =>
        Promise.resolve({
          mime: "video/mp4" as const,
          durationMs: 1000,
          fpsNumerator: 24,
          fpsDenominator: 1,
          width: 1280,
          height: 720,
        }),
      ),
      remux: vi.fn(async (_source, destination) => {
        await writeFile(destination, Buffer.alloc(100, 1));
      }),
    };

    await expect(
      storeUpload({
        source: Readable.from(mp4Bytes()),
        filename: "review.mp4",
        config,
        mediaTools,
        existingStorageBytes: 40,
      }),
    ).rejects.toThrow(UploadLimitError);
    expect(await readdir(config.storageDir)).toEqual([]);
  });
});
