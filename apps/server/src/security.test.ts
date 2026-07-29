import { describe, expect, it } from "vitest";
import {
  hashPassword,
  hashToken,
  normalizeDisplayFilename,
  randomToken,
  safeEqual,
  verifyPassword,
} from "./security.js";

describe("security helpers", () => {
  it("creates high-entropy URL-safe tokens and stable hashes", () => {
    const first = randomToken();
    const second = randomToken();

    expect(first).toMatch(/^[\w-]{40,}$/u);
    expect(first).not.toBe(second);
    expect(hashToken(first)).toHaveLength(64);
    expect(hashToken(first)).toBe(hashToken(first));
  });

  it("hashes passwords with unique salts and verifies without plaintext storage", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");

    expect(first).not.toBe(second);
    await expect(verifyPassword("correct horse battery staple", first)).resolves.toBe(
      true,
    );
    await expect(verifyPassword("wrong", first)).resolves.toBe(false);
    await expect(verifyPassword("anything", "not-a-supported-hash")).resolves.toBe(
      false,
    );
  });

  it("compares token material safely", () => {
    expect(safeEqual("same", "same")).toBe(true);
    expect(safeEqual("same", "different")).toBe(false);
  });

  it("removes traversal, control characters, and unsafe filename punctuation", () => {
    expect(normalizeDisplayFilename("../..\\secret\u0000<script>.mp4")).toBe(
      "secret_script_.mp4",
    );
    expect(normalizeDisplayFilename("  ")).toBe("video");
    expect(normalizeDisplayFilename("rough cut 01.mp4")).toBe("rough cut 01.mp4");
  });
});
