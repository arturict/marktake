import { useState } from "react";
import type { Annotation } from "@marktake/shared";

export type DrawingTool = "pin" | "rect" | "arrow" | "freehand";

type Point = { x: number; y: number };

function pointFromEvent(event: React.PointerEvent<SVGSVGElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function AnnotationShape({
  annotation,
  muted = false,
}: {
  annotation: Annotation;
  muted?: boolean;
}): React.JSX.Element {
  const color = muted ? "rgba(255,255,255,.72)" : "#ff6b35";
  if (annotation.tool === "pin") {
    return (
      <g>
        <circle cx={annotation.x * 100} cy={annotation.y * 100} r="2.2" fill={color} />
        <circle
          cx={annotation.x * 100}
          cy={annotation.y * 100}
          r="4.4"
          fill="none"
          stroke={color}
          strokeWidth=".65"
        />
      </g>
    );
  }
  if (annotation.tool === "rect") {
    return (
      <rect
        x={annotation.x * 100}
        y={annotation.y * 100}
        width={annotation.width * 100}
        height={annotation.height * 100}
        fill={`${color}19`}
        stroke={color}
        strokeWidth=".7"
      />
    );
  }
  if (annotation.tool === "arrow") {
    return (
      <g>
        <line
          x1={annotation.x1 * 100}
          y1={annotation.y1 * 100}
          x2={annotation.x2 * 100}
          y2={annotation.y2 * 100}
          stroke={color}
          strokeWidth=".8"
          strokeLinecap="round"
        />
        <circle
          cx={annotation.x2 * 100}
          cy={annotation.y2 * 100}
          r="1.7"
          fill={color}
        />
      </g>
    );
  }
  return (
    <polyline
      points={annotation.points
        .map(([x, y]) => `${String(x * 100)},${String(y * 100)}`)
        .join(" ")}
      fill="none"
      stroke={color}
      strokeWidth=".8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export function AnnotationOverlay({
  tool,
  draft,
  selected,
  onChange,
  disabled,
}: {
  tool: DrawingTool;
  draft: Annotation[];
  selected: Annotation[];
  onChange: (annotations: Annotation[]) => void;
  disabled: boolean;
}): React.JSX.Element {
  const [start, setStart] = useState<Point | null>(null);

  return (
    <svg
      className={`annotation-layer ${disabled ? "disabled" : ""}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-label="Draw an annotation on the paused video"
      onPointerDown={(event) => {
        if (disabled) return;
        const point = pointFromEvent(event);
        event.currentTarget.setPointerCapture(event.pointerId);
        if (tool === "pin") {
          onChange([...draft, { tool: "pin", ...point }]);
          return;
        }
        setStart(point);
        if (tool === "freehand") {
          onChange([...draft, { tool: "freehand", points: [[point.x, point.y]] }]);
        }
      }}
      onPointerMove={(event) => {
        if (disabled || !start || tool !== "freehand") return;
        const point = pointFromEvent(event);
        const last = draft.at(-1);
        if (last?.tool !== "freehand" || last.points.length >= 200) return;
        const previous = last.points.at(-1);
        if (
          previous &&
          Math.hypot(previous[0] - point.x, previous[1] - point.y) < 0.005
        ) {
          return;
        }
        onChange([
          ...draft.slice(0, -1),
          { ...last, points: [...last.points, [point.x, point.y]] },
        ]);
      }}
      onPointerUp={(event) => {
        if (disabled || !start) return;
        const end = pointFromEvent(event);
        if (tool === "rect") {
          const x = Math.min(start.x, end.x);
          const y = Math.min(start.y, end.y);
          const width = Math.abs(end.x - start.x);
          const height = Math.abs(end.y - start.y);
          if (width > 0.005 && height > 0.005) {
            onChange([...draft, { tool: "rect", x, y, width, height }]);
          }
        } else if (
          tool === "arrow" &&
          Math.hypot(end.x - start.x, end.y - start.y) > 0.01
        ) {
          onChange([
            ...draft,
            { tool: "arrow", x1: start.x, y1: start.y, x2: end.x, y2: end.y },
          ]);
        } else if (tool === "freehand") {
          const last = draft.at(-1);
          if (last?.tool === "freehand" && last.points.length < 2) {
            onChange(draft.slice(0, -1));
          }
        }
        setStart(null);
      }}
      onPointerCancel={() => setStart(null)}
    >
      {selected.map((annotation, index) => (
        <AnnotationShape
          key={`selected-${String(index)}`}
          annotation={annotation}
          muted
        />
      ))}
      {draft.map((annotation, index) => (
        <AnnotationShape key={`draft-${String(index)}`} annotation={annotation} />
      ))}
    </svg>
  );
}
