import type { Annotation, CommentStatus } from "./schemas.js";

export type SessionInfo = {
  authenticated: boolean;
  kind?: "admin" | "guest";
  displayName?: string;
  csrfToken?: string;
};

export type ReviewComment = {
  id: string;
  versionId: string;
  parentId: string | null;
  authorName: string;
  body: string;
  frameNumber: number;
  timeMs: number;
  annotations: Annotation[];
  status: CommentStatus;
  createdAt: string;
  replies: ReviewComment[];
};

export type ReviewVersion = {
  id: string;
  ordinal: number;
  label: string;
  originalName: string;
  mime: "video/mp4" | "video/webm";
  sizeBytes: number;
  durationMs: number;
  fpsNumerator: number;
  fpsDenominator: number;
  width: number;
  height: number;
  status: "in_review" | "approved" | "changes_requested";
  createdAt: string;
  mediaUrl: string;
  comments: ReviewComment[];
};

export type ReviewProject = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  versions: ReviewVersion[];
};
