import { z } from "zod";

const normalized = z.number().min(0).max(1);

function hasUnsafeControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    ) {
      return true;
    }
  }
  return false;
}

export const annotationSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("pin"),
    x: normalized,
    y: normalized,
  }),
  z.object({
    tool: z.literal("rect"),
    x: normalized,
    y: normalized,
    width: normalized,
    height: normalized,
  }),
  z.object({
    tool: z.literal("arrow"),
    x1: normalized,
    y1: normalized,
    x2: normalized,
    y2: normalized,
  }),
  z.object({
    tool: z.literal("freehand"),
    points: z
      .array(z.tuple([normalized, normalized]))
      .min(2)
      .max(200),
  }),
]);

export const annotationsSchema = z.array(annotationSchema).max(25);

export const safeTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine((value) => !hasUnsafeControlCharacter(value), {
    message: "Control characters are not allowed.",
  });

export const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => !/[<>]/u.test(value), {
    message: "Angle brackets are not allowed in display names.",
  });

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const loginSchema = z.object({
  password: z.string().min(1).max(1_024),
});

export const guestExchangeSchema = z.object({
  token: z.string().min(32).max(256),
  displayName: displayNameSchema,
  password: z.string().max(1_024).optional(),
});

export const createShareSchema = z.object({
  password: z.string().min(8).max(1_024).optional(),
  expiresAt: z.iso.datetime().optional(),
  allowComments: z.boolean().default(true),
});

export const createCommentSchema = z.object({
  body: safeTextSchema,
  frameNumber: z.number().int().min(0).max(10_000_000),
  timeMs: z.number().int().min(0).max(86_400_000),
  annotations: annotationsSchema.default([]),
});

export const createReplySchema = z.object({
  body: safeTextSchema,
});

export const updateCommentStatusSchema = z.object({
  status: z.enum(["open", "resolved"]),
});

export const decisionSchema = z.object({
  decision: z.enum(["approved", "changes_requested"]),
});

export type Annotation = z.infer<typeof annotationSchema>;
export type CommentStatus = "open" | "resolved";
export type ReviewDecision = "approved" | "changes_requested";
