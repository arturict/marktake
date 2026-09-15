import {
  annotationsSchema,
  type Annotation,
  type ReviewComment,
} from "@marktake/shared";

export type StoredReviewDraft = {
  body: string;
  annotations: Annotation[];
  frameNumber: number;
  baseRevision: string;
};

export function reviewRevision(comments: ReviewComment[]): string {
  return comments
    .map(
      (comment) => `${comment.id}:${comment.status}:${String(comment.replies.length)}`,
    )
    .join("|");
}

export function parseStoredReviewDraft(raw: string | null): StoredReviewDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredReviewDraft>;
    const frameNumber = value.frameNumber;
    const annotations = annotationsSchema.safeParse(value.annotations);
    if (
      typeof value.body !== "string" ||
      value.body.length > 2_000 ||
      !annotations.success ||
      !Number.isInteger(frameNumber) ||
      frameNumber === undefined ||
      frameNumber < 0 ||
      typeof value.baseRevision !== "string"
    ) {
      return null;
    }
    return {
      body: value.body,
      annotations: annotations.data,
      frameNumber,
      baseRevision: value.baseRevision,
    };
  } catch {
    return null;
  }
}

export function draftStorageKey(versionId: string): string {
  return `marktake.review-draft.${versionId}`;
}
