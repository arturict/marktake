import { describe, expect, it } from "vitest";
import {
  draftStorageKey,
  parseStoredReviewDraft,
  reviewRevision,
} from "./reviewDraft.js";

describe("review drafts", () => {
  it("restores a bounded valid draft", () => {
    expect(
      parseStoredReviewDraft(
        JSON.stringify({
          body: "Hold the title.",
          annotations: [{ tool: "pin", x: 0.5, y: 0.4 }],
          frameNumber: 12,
          baseRevision: "comment-a:open:0",
        }),
      ),
    ).toEqual({
      body: "Hold the title.",
      annotations: [{ tool: "pin", x: 0.5, y: 0.4 }],
      frameNumber: 12,
      baseRevision: "comment-a:open:0",
    });
  });

  it.each([
    null,
    "{",
    JSON.stringify({ body: "missing fields" }),
    JSON.stringify({
      body: "x".repeat(2_001),
      annotations: [],
      frameNumber: 0,
      baseRevision: "",
    }),
    JSON.stringify({
      body: "",
      annotations: [],
      frameNumber: -1,
      baseRevision: "",
    }),
    JSON.stringify({
      body: "",
      annotations: [{ tool: "pin", x: 4, y: 0.5 }],
      frameNumber: 0,
      baseRevision: "",
    }),
  ])("rejects malformed or unbounded data", (raw) => {
    expect(parseStoredReviewDraft(raw)).toBeNull();
  });

  it("tracks comment status and reply count without storing comment text", () => {
    expect(
      reviewRevision([
        {
          id: "comment-a",
          versionId: "version-a",
          parentId: null,
          authorName: "Reviewer",
          body: "Private feedback",
          frameNumber: 2,
          timeMs: 80,
          annotations: [],
          status: "resolved",
          createdAt: "2026-07-29T10:00:00.000Z",
          replies: [
            {
              id: "reply-a",
              versionId: "version-a",
              parentId: "comment-a",
              authorName: "Owner",
              body: "Done",
              frameNumber: 2,
              timeMs: 80,
              annotations: [],
              status: "open",
              createdAt: "2026-07-29T10:01:00.000Z",
              replies: [],
            },
          ],
        },
      ]),
    ).toBe("comment-a:resolved:1");
    expect(draftStorageKey("version-a")).toBe("marktake.review-draft.version-a");
  });
});
