import { describe, expect, it } from "vitest";
import {
  formatTimecode,
  frameToMediaTime,
  mediaTimeToFrame,
  parseFrameRate,
} from "./timecode.js";

describe("timecode", () => {
  it.each([
    ["24/1", 2.5, 60, "00:00:02:12"],
    ["25/1", 2.5, 62, "00:00:02:12"],
    ["30000/1001", 2.5, 74, "00:00:02:14"],
    ["24000/1001", 2.5, 59, "00:00:02:11"],
  ])("maps media time for %s", (rawRate, seconds, frame, expected) => {
    const rate = parseFrameRate(rawRate);
    expect(mediaTimeToFrame(seconds, rate)).toBe(frame);
    expect(formatTimecode(frame, rate)).toBe(expected);
  });

  it("seeks to the middle of a frame", () => {
    expect(frameToMediaTime(24, { numerator: 24, denominator: 1 })).toBeCloseTo(
      1.020833,
      5,
    );
  });

  it("rejects invalid input", () => {
    expect(() => parseFrameRate("0/0")).toThrow();
    expect(() => mediaTimeToFrame(-1, { numerator: 24, denominator: 1 })).toThrow();
    expect(() => frameToMediaTime(1.5, { numerator: 24, denominator: 1 })).toThrow();
  });
});
