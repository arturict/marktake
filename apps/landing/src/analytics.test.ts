import { describe, expect, it, vi } from "vitest";

import {
  createLandingEventTracker,
  isProductionLandingLocation,
  sanitizeUmamiPayload,
} from "./analytics.js";

describe("landing analytics event contract", () => {
  it("runs only on the production landing root", () => {
    expect(
      isProductionLandingLocation({
        hostname: "marktake.vercel.app",
        pathname: "/",
      }),
    ).toBe(true);
    expect(
      isProductionLandingLocation({
        hostname: "marktake.vercel.app",
        pathname: "/review/example",
      }),
    ).toBe(false);
    expect(isProductionLandingLocation({ hostname: "localhost", pathname: "/" })).toBe(
      false,
    );
  });

  it("emits only bounded CTA values", () => {
    const send = vi.fn();
    const tracker = createLandingEventTracker(send);

    tracker.cta("run-self-hosted", "hero", "install");
    tracker.cta("arbitrary", "hero", "install");

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("landing-cta", {
      action: "run-self-hosted",
      location: "hero",
      target: "install",
    });
  });

  it("emits section, scroll, and engagement thresholds exactly once", () => {
    const send = vi.fn();
    const tracker = createLandingEventTracker(send);

    tracker.section("product");
    tracker.section("product");
    tracker.section("unknown");
    tracker.scroll(76);
    tracker.scroll(100);
    tracker.scroll(100);
    tracker.engaged(60);
    tracker.engaged(120);

    expect(send.mock.calls).toEqual([
      ["landing-section-view", { section: "product" }],
      ["landing-scroll-depth", { depth: 25 }],
      ["landing-scroll-depth", { depth: 50 }],
      ["landing-scroll-depth", { depth: 75 }],
      ["landing-scroll-depth", { depth: 100 }],
      ["landing-engaged-time", { seconds: 30 }],
      ["landing-engaged-time", { seconds: 60 }],
      ["landing-engaged-time", { seconds: 120 }],
    ]);
  });

  it("keeps only safe standard UTM values and strips referrer paths", () => {
    const navigatorLike = {
      doNotTrack: "0",
      globalPrivacyControl: false,
    } as unknown as Navigator;
    expect(
      sanitizeUmamiPayload(
        {
          url: "/?utm_source=reddit&utm_campaign=oss_launch&email=secret%40example.com&utm_term=bad value",
          referrer:
            "https://www.reddit.com/r/selfhosted/comments/private-thread?user=42",
        },
        navigatorLike,
        "https://marktake.vercel.app",
      ),
    ).toEqual({
      url: "/?utm_source=reddit&utm_campaign=oss_launch",
      referrer: "https://www.reddit.com",
    });
  });

  it("fails closed for Global Privacy Control", () => {
    const navigatorLike = { globalPrivacyControl: true } as unknown as Navigator;
    expect(
      sanitizeUmamiPayload(
        { url: "/?utm_source=reddit" },
        navigatorLike,
        "https://marktake.vercel.app",
      ),
    ).toBe(false);
  });
});
