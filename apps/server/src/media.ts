import { execFile as execFileCallback } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { fileTypeFromFile } from "file-type";
import { parseFrameRate, framesPerSecond } from "@marktake/shared";
import type { AppConfig } from "./config.js";
import { normalizeDisplayFilename } from "./security.js";

const execFile = promisify(execFileCallback);

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
};

type ProbeOutput = {
  streams?: ProbeStream[];
  format?: {
    duration?: string;
  };
};

export type MediaMetadata = {
  mime: "video/mp4" | "video/webm";
  durationMs: number;
  fpsNumerator: number;
  fpsDenominator: number;
  width: number;
  height: number;
};

export type StoredUpload = MediaMetadata & {
  originalName: string;
  storedName: string;
  sizeBytes: number;
};

export type MediaTools = {
  inspect(filePath: string, mime: "video/mp4" | "video/webm"): Promise<MediaMetadata>;
  remux(
    sourcePath: string,
    destinationPath: string,
    mime: "video/mp4" | "video/webm",
  ): Promise<void>;
};

export class UploadLimitError extends Error {}
export class UnsupportedMediaError extends Error {}

export async function createExampleMedia(
  destinationPath: string,
  config: AppConfig,
): Promise<void> {
  try {
    await execFile(
      config.ffmpegPath,
      [
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=960x540:rate=24:duration=6",
        "-an",
        "-c:v",
        "libvpx-vp9",
        "-deadline",
        "realtime",
        "-cpu-used",
        "6",
        "-crf",
        "38",
        "-b:v",
        "0",
        "-pix_fmt",
        "yuv420p",
        destinationPath,
      ],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
    );
  } catch {
    throw new UnsupportedMediaError(
      "The local example could not be generated. Check the server ffmpeg installation.",
    );
  }
}

class ByteLimiter extends Transform {
  private seen = 0;
  constructor(private readonly limit: number) {
    super();
  }
  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    this.seen += chunk.length;
    if (this.seen > this.limit) {
      callback(new UploadLimitError(`Upload exceeds ${String(this.limit)} bytes.`));
      return;
    }
    callback(null, chunk);
  }
}

export function validateProbe(
  output: ProbeOutput,
  mime: "video/mp4" | "video/webm",
): MediaMetadata {
  const video = output.streams?.find((stream) => stream.codec_type === "video");
  const audio = output.streams?.find((stream) => stream.codec_type === "audio");
  if (!video?.codec_name || !video.width || !video.height) {
    throw new UnsupportedMediaError(
      "The upload does not contain a valid video stream.",
    );
  }
  const videoCodecs =
    mime === "video/mp4" ? new Set(["h264"]) : new Set(["vp8", "vp9"]);
  const audioCodecs =
    mime === "video/mp4" ? new Set(["aac", "mp3"]) : new Set(["opus", "vorbis"]);
  if (!videoCodecs.has(video.codec_name)) {
    throw new UnsupportedMediaError(
      mime === "video/mp4"
        ? "MP4 uploads must use H.264 video."
        : "WebM uploads must use VP8 or VP9 video.",
    );
  }
  if (audio?.codec_name && !audioCodecs.has(audio.codec_name)) {
    throw new UnsupportedMediaError(
      "The audio codec is not browser-safe for this container.",
    );
  }
  const durationSeconds = Number(output.format?.duration);
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > 86_400
  ) {
    throw new UnsupportedMediaError(
      "Video duration is missing or outside the 24-hour limit.",
    );
  }
  const averageRate = parseFrameRate(video.avg_frame_rate ?? "0/0");
  const nominalRate = parseFrameRate(video.r_frame_rate ?? "0/0");
  const averageFps = framesPerSecond(averageRate);
  const nominalFps = framesPerSecond(nominalRate);
  if (Math.abs(averageFps - nominalFps) / averageFps > 0.005) {
    throw new UnsupportedMediaError(
      "Variable-frame-rate video is not supported in v1. Export a constant-frame-rate review copy.",
    );
  }
  if (averageFps < 1 || averageFps > 240) {
    throw new UnsupportedMediaError("Frame rate must be between 1 and 240 fps.");
  }
  return {
    mime,
    durationMs: Math.round(durationSeconds * 1_000),
    fpsNumerator: averageRate.numerator,
    fpsDenominator: averageRate.denominator,
    width: video.width,
    height: video.height,
  };
}

export function createMediaTools(config: AppConfig): MediaTools {
  return {
    async inspect(filePath, mime) {
      try {
        const { stdout } = await execFile(
          config.ffprobePath,
          [
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate:format=duration",
            "-of",
            "json",
            filePath,
          ],
          { windowsHide: true, maxBuffer: 1024 * 1024 },
        );
        return validateProbe(JSON.parse(stdout) as ProbeOutput, mime);
      } catch (error) {
        if (error instanceof UnsupportedMediaError) throw error;
        throw new UnsupportedMediaError(
          "ffprobe could not validate this upload. Check the file and server media tools.",
        );
      }
    },
    async remux(sourcePath, destinationPath, mime) {
      const args = [
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-i",
        sourcePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-map_metadata",
        "-1",
        "-c",
        "copy",
      ];
      if (mime === "video/mp4") args.push("-movflags", "+faststart");
      args.push(destinationPath);
      try {
        await execFile(config.ffmpegPath, args, {
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        });
      } catch {
        throw new UnsupportedMediaError(
          "ffmpeg could not create a metadata-stripped browser copy.",
        );
      }
    },
  };
}

export async function storeUpload(input: {
  source: Readable;
  filename: string;
  config: AppConfig;
  mediaTools: MediaTools;
  existingStorageBytes: number;
}): Promise<StoredUpload> {
  await Promise.all([
    mkdir(input.config.storageDir, { recursive: true }),
    mkdir(input.config.tempDir, { recursive: true }),
  ]);
  const tempPath = path.join(input.config.tempDir, `${randomUUID()}.upload`);
  let destinationPath: string | undefined;
  try {
    await pipeline(
      input.source,
      new ByteLimiter(input.config.maxUploadBytes),
      createWriteStream(tempPath, { flags: "wx", mode: 0o600 }),
    );
    const tempStat = await stat(tempPath);
    if (tempStat.size <= 0) throw new UnsupportedMediaError("The upload is empty.");
    if (input.existingStorageBytes + tempStat.size > input.config.maxStorageBytes) {
      throw new UploadLimitError(
        "The configured Marktake storage limit would be exceeded.",
      );
    }
    const detected = await fileTypeFromFile(tempPath);
    const mime =
      detected?.mime === "video/mp4"
        ? "video/mp4"
        : detected?.mime === "video/webm"
          ? "video/webm"
          : null;
    if (!mime) {
      throw new UnsupportedMediaError(
        "Only genuine MP4 (H.264) and WebM (VP8/VP9) video files are accepted.",
      );
    }
    const metadata = await input.mediaTools.inspect(tempPath, mime);
    const extension = mime === "video/mp4" ? ".mp4" : ".webm";
    const storedName = `${randomUUID()}${extension}`;
    destinationPath = path.join(input.config.storageDir, storedName);
    await input.mediaTools.remux(tempPath, destinationPath, mime);
    const finalStat = await stat(destinationPath);
    if (input.existingStorageBytes + finalStat.size > input.config.maxStorageBytes) {
      throw new UploadLimitError("The remuxed video exceeds the storage limit.");
    }
    return {
      ...metadata,
      originalName: normalizeDisplayFilename(input.filename),
      storedName,
      sizeBytes: finalStat.size,
    };
  } catch (error) {
    if (destinationPath) await rm(destinationPath, { force: true });
    throw error;
  } finally {
    await rm(tempPath, { force: true });
  }
}
