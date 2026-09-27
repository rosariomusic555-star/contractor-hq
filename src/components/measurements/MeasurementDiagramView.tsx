import {
  activeRuns,
  areaRectStyle,
  computeTotals,
  featureKindOf,
  normalizeData,
  totalsHeadline,
  type FeatureDataByKind,
} from "@/lib/measurements";
import { CircleDiagram, LShapeDiagram, PathUDiagram, RectDiagram, RunDiagram, UShapeDiagram } from "./diagrams";

/**
 * Read-only measurement diagram (crew work order, 0125) — the same SVG
 * shapes the measurement editors draw, with the dimensions labeled, plus
 * the one-line totals ("20 × 15 ft · 300 sq ft"). Fits the width; the
 * page's own pinch-to-zoom works on it.
 */
export function MeasurementDiagramView({ buildType, data, idPrefix }: { buildType: string; data: unknown; idPrefix: string }) {
  const kind = featureKindOf(buildType);
  if (!kind) return null;
  const d = normalizeData(kind, data);
  const headline = totalsHeadline(kind, computeTotals(kind, d));
  let diagram: JSX.Element | null = null;

  if (kind === "patio" || kind === "flatwork") {
    const p = d as FeatureDataByKind["patio"];
    if (p.method !== "total") {
      if (p.shape === "rectangle") diagram = <RectDiagram length={p.rect.length_ft} width={p.rect.width_ft} idPrefix={idPrefix} proportion={areaRectStyle(buildType)} />;
      else if (p.shape === "l_shape") diagram = <LShapeDiagram v={p.l} idPrefix={idPrefix} />;
      else if (p.shape === "u_shape" && kind === "flatwork")
        diagram = <PathUDiagram a={p.path_u.a} b={p.path_u.b} c={p.path_u.c} width={p.path_u.width} openRight={p.path_u.open_right} idPrefix={idPrefix} />;
      else if (p.shape === "u_shape") diagram = <UShapeDiagram v={p.u} idPrefix={idPrefix} />;
    }
  } else if (kind === "kitchen" || kind === "seating_wall" || kind === "retaining_wall") {
    const r = d as FeatureDataByKind["seating_wall"];
    if (r.layout !== "custom" && (kind !== "retaining_wall" || (d as FeatureDataByKind["retaining_wall"]).method === "lf_height")) {
      diagram = <RunDiagram layout={r.layout} runs={activeRuns(r).map((x) => x.length_ft)} idPrefix={idPrefix} />;
    }
  } else if (kind === "fire_pit") {
    const f = d as FeatureDataByKind["fire_pit"];
    if (f.shape === "round") diagram = <CircleDiagram diameter={f.diameter_ft} idPrefix={idPrefix} />;
    else if (f.shape === "rect") diagram = <RectDiagram length={f.length_ft} width={f.width_ft} idPrefix={idPrefix} />;
  }

  if (!diagram && !headline) return null;
  return (
    <figure className="space-y-1" style={{ touchAction: "pinch-zoom" }}>
      {diagram && <div className="pointer-events-none mx-auto w-full max-w-md [&_svg]:h-auto [&_svg]:w-full">{diagram}</div>}
      {headline && <figcaption className="text-center text-sm font-semibold text-foreground">{headline}</figcaption>}
    </figure>
  );
}
