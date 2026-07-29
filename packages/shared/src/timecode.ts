export type FrameRate = {
  numerator: number;
  denominator: number;
};

export function framesPerSecond(rate: FrameRate): number {
  if (
    !Number.isInteger(rate.numerator) ||
    !Number.isInteger(rate.denominator) ||
    rate.numerator <= 0 ||
    rate.denominator <= 0
  ) {
    throw new Error("Frame rate must contain positive integers.");
  }
  return rate.numerator / rate.denominator;
}

export function mediaTimeToFrame(timeSeconds: number, rate: FrameRate): number {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
    throw new Error("Media time must be a finite, non-negative number.");
  }
  return Math.max(0, Math.floor(timeSeconds * framesPerSecond(rate) + 1e-7));
}

export function frameToMediaTime(frame: number, rate: FrameRate): number {
  if (!Number.isInteger(frame) || frame < 0) {
    throw new Error("Frame must be a non-negative integer.");
  }
  return (frame + 0.5) / framesPerSecond(rate);
}

export function formatTimecode(frame: number, rate: FrameRate): string {
  if (!Number.isInteger(frame) || frame < 0) {
    throw new Error("Frame must be a non-negative integer.");
  }
  const nominalFps = Math.ceil(framesPerSecond(rate));
  const frames = frame % nominalFps;
  const totalSeconds = Math.floor(frame / nominalFps);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return [hours, minutes, seconds, frames]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

export function parseFrameRate(value: string): FrameRate {
  const [numeratorRaw, denominatorRaw] = value.split("/");
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw ?? "1");
  const rate = { numerator, denominator };
  framesPerSecond(rate);
  return rate;
}
