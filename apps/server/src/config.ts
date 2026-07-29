import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  MARKTAKE_ADMIN_PASSWORD: z.string().min(12),
  MARKTAKE_PUBLIC_URL: z.url().default("http://localhost:4180"),
  MARKTAKE_DATA_DIR: z.string().min(1).default(".marktake"),
  MARKTAKE_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .default(512 * 1024 * 1024),
  MARKTAKE_MAX_STORAGE_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .default(5 * 1024 * 1024 * 1024),
  MARKTAKE_SECURE_COOKIES: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  MARKTAKE_FFPROBE_PATH: z.string().min(1).default("ffprobe"),
  MARKTAKE_FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  MARKTAKE_WEB_DIST: z.string().min(1).optional(),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4180),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type AppConfig = {
  adminPassword: string;
  publicUrl: string;
  dataDir: string;
  databasePath: string;
  storageDir: string;
  tempDir: string;
  maxUploadBytes: number;
  maxStorageBytes: number;
  secureCookies: boolean;
  ffprobePath: string;
  ffmpegPath: string;
  webDist: string;
  host: string;
  port: number;
  environment: "development" | "test" | "production";
};

export function loadConfig(
  source: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): AppConfig {
  const env = envSchema.parse(source);
  const dataDir = path.resolve(cwd, env.MARKTAKE_DATA_DIR);
  const publicUrl = env.MARKTAKE_PUBLIC_URL.replace(/\/+$/u, "");
  if (env.MARKTAKE_SECURE_COOKIES && !publicUrl.startsWith("https://")) {
    throw new Error("Secure cookies require an HTTPS MARKTAKE_PUBLIC_URL.");
  }
  return {
    adminPassword: env.MARKTAKE_ADMIN_PASSWORD,
    publicUrl,
    dataDir,
    databasePath: path.join(dataDir, "marktake.sqlite"),
    storageDir: path.join(dataDir, "media"),
    tempDir: path.join(dataDir, "tmp"),
    maxUploadBytes: env.MARKTAKE_MAX_UPLOAD_BYTES,
    maxStorageBytes: env.MARKTAKE_MAX_STORAGE_BYTES,
    secureCookies: env.MARKTAKE_SECURE_COOKIES,
    ffprobePath: env.MARKTAKE_FFPROBE_PATH,
    ffmpegPath: env.MARKTAKE_FFMPEG_PATH,
    webDist: path.resolve(
      cwd,
      env.MARKTAKE_WEB_DIST ?? path.join("apps", "web", "dist"),
    ),
    host: env.HOST,
    port: env.PORT,
    environment: env.NODE_ENV,
  };
}
