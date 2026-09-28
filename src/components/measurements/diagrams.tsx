import { fmtFeetPrime } from "@/lib/feetInches";

/**
 * Simple, illustrative shape diagrams — not CAD. Each edge carries a badge
 * with its letter and current value ("A · 20′"); tapping a badge focuses
 * that edge's input below the diagram (inputs are found by id:
 * `${idPrefix}-${letter}`). Drawn in a fixed viewBox and scaled to fit, so
 * proportions are schematic, not to scale.
 */

type EdgeValues = Partial<Record<"a" | "b" | "c" | "d" | "e" | "f", number | null>>;

const focusInput = (id: string) => {
  const el = document.getElementById(id) as HTMLInputElement | null;
  el?.focus();
  el?.select();
};

function Badge({ x, y, letter, value, idPrefix }: { x: number; y: number; letter: string; value: number | null; idPrefix: string }) {
  const text = value ? `${letter} · ${fmtFeetPrime(value)}` : letter;
  const w = 10 + text.length * 6.2;
  // Keep a long value ("B · 120′ 6″") inside the 240-wide frame instead of
  // clipping at the edge — it just slides inward along its edge.
  x = Math.min(Math.max(x, w / 2 + 2), 240 - w / 2 - 2);
  return (
    <g
      role="button"
      tabIndex={-1}
      aria-label={`Edit edge ${letter}`}
      onClick={() => focusInput(`${idPrefix}-${letter.toLowerCase()}`)}
      className="cursor-pointer"
    >
      <rect
        x={x - w / 2}
        y={y - 9}
        width={w}
        height={18}
        rx={9}
        className={value ? "fill-primary" : "fill-card stroke-border"}
        strokeWidth={1}
      />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        className={value ? "fill-primary-foreground" : "fill-muted-foreground"}
        style={{ fontSize: 11, fontWeight: 700 }}
      >
        {text}
      </text>
    </g>
  );
}

const SHAPE = "fill-primary/15 stroke-primary";

function Frame({ children, label, height = 160 }: { children: React.ReactNode; label: string; height?: number }) {
  return (
    <svg viewBox={`0 0 240 ${height}`} role="img" aria-label={label} className="mx-auto block h-auto w-full max-w-[320px] select-none">
      {children}
    </svg>
  );
}

export function RectDiagram({
  length,
  width,
  idPrefix,
  proportion = "wide",
}: {
  length: number | null;
  width: number | null;
  idPrefix: string;
  /** Per feature (areaRectStyle): "wide" — a block, length along the
   * bottom (patio, driveway, fire pit); "tall" — a walkway strip, length
   * running top-to-bottom and width across the short top edge. Both are a
   * fixed illustration, not to scale, so a big width never turns the
   * walkway into a block. */
  proportion?: "wide" | "tall";
}) {
  if (proportion === "tall") {
    return (
      <Frame label="Walkway: length running top to bottom, width across the top">
        {/* ~1:3 strip, centred */}
        <rect x={99} y={26} width={42} height={126} className={SHAPE} strokeWidth={2} />
        <Badge x={120} y={13} letter="W" value={width} idPrefix={idPrefix} />
        <Badge x={72} y={89} letter="L" value={length} idPrefix={idPrefix} />
      </Frame>
    );
  }
  return (
    <Frame label="Rectangle: length along the bottom, width up the side">
      <rect x={40} y={25} width={170} height={100} className={SHAPE} strokeWidth={2} />
      <Badge x={125} y={140} letter="L" value={length} idPrefix={idPrefix} />
      <Badge x={22} y={75} letter="W" value={width} idPrefix={idPrefix} />
    </Frame>
  );
}

/** L: bottom A (full), left B (full), top C (upper arm), right D (lower arm). */
export function LShapeDiagram({ v, idPrefix }: { v: EdgeValues; idPrefix: string }) {
  return (
    <Frame label="L-shape with edges A (bottom), B (left), C (top), D (right)">
      <path d="M40 130 H210 V80 H110 V20 H40 Z" className={SHAPE} strokeWidth={2} strokeLinejoin="round" />
      <Badge x={125} y={146} letter="A" value={v.a} idPrefix={idPrefix} />
      <Badge x={22} y={75} letter="B" value={v.b} idPrefix={idPrefix} />
      <Badge x={75} y={11} letter="C" value={v.c} idPrefix={idPrefix} />
      <Badge x={210} y={105} letter="D" value={v.d} idPrefix={idPrefix} />
    </Frame>
  );
}

/** U (open at the top): bottom A, left B, left arm top C, right D, right arm
 * top E, base band depth F. */
export function UShapeDiagram({ v, idPrefix }: { v: EdgeValues; idPrefix: string }) {
  return (
    <Frame label="U-shape with edges A (bottom), B (left), C (left arm top), D (right), E (right arm top), F (base depth)">
      <path d="M40 130 H210 V20 H165 V88 H85 V20 H40 Z" className={SHAPE} strokeWidth={2} strokeLinejoin="round" />
      {/* F: the base band's depth, drawn as a dimension line inside it. */}
      <line x1={125} y1={90} x2={125} y2={128} className="stroke-primary" strokeWidth={1.5} strokeDasharray="3 3" />
      <Badge x={125} y={146} letter="A" value={v.a} idPrefix={idPrefix} />
      <Badge x={22} y={75} letter="B" value={v.b} idPrefix={idPrefix} />
      <Badge x={62} y={11} letter="C" value={v.c} idPrefix={idPrefix} />
      <Badge x={222} y={75} letter="D" value={v.d} idPrefix={idPrefix} />
      <Badge x={188} y={11} letter="E" value={v.e} idPrefix={idPrefix} />
      <Badge x={125} y={109} letter="F" value={v.f} idPrefix={idPrefix} />
    </Frame>
  );
}

/** Runs (Outdoor Kitchen counters, Seating Wall sections): A along the
 * back, B/C returning toward the viewer; Curved is a single arc measured
 * along the curve. */
export function RunDiagram({
  layout,
  runs,
  idPrefix,
}: {
  layout: "straight" | "l_shape" | "u_shape" | "curved";
  runs: (number | null)[];
  idPrefix: string;
}) {
  const bar = "fill-primary/20 stroke-primary";
  if (layout === "curved") {
    return (
      <Frame label="Curved run A, measured along the curve" height={110}>
        <path d="M30 95 Q120 -5 210 95" fill="none" className="stroke-primary/25" strokeWidth={26} strokeLinecap="round" />
        <path d="M30 95 Q120 -5 210 95" fill="none" className="stroke-primary" strokeWidth={2} strokeDasharray="4 4" />
        <Badge x={120} y={45} letter="A" value={runs[0]} idPrefix={idPrefix} />
      </Frame>
    );
  }
  return (
    // A straight run is one bar — no need for the full-height frame.
    <Frame label={`Layout: ${layout.replace("_", "-")}`} height={layout === "straight" ? 72 : 160}>
      {/* A — the back run */}
      <rect x={40} y={30} width={170} height={26} rx={3} className={bar} strokeWidth={2} />
      <Badge x={125} y={43} letter="A" value={runs[0]} idPrefix={idPrefix} />
      {(layout === "l_shape" || layout === "u_shape") && (
        <>
          <rect x={40} y={56} width={26} height={84} rx={3} className={bar} strokeWidth={2} />
          <Badge x={53} y={112} letter="B" value={runs[1]} idPrefix={idPrefix} />
        </>
      )}
      {layout === "u_shape" && (
        <>
          <rect x={184} y={56} width={26} height={84} rx={3} className={bar} strokeWidth={2} />
          <Badge x={197} y={112} letter="C" value={runs[2]} idPrefix={idPrefix} />
        </>
      )}
    </Frame>
  );
}

/** Round (fire pit): a circle with its diameter drawn across it. The badge
 * focuses `${idPrefix}-d`. */
export function CircleDiagram({ diameter, idPrefix }: { diameter: number | null; idPrefix: string }) {
  return (
    <Frame label="Circle with its diameter drawn across it" height={150}>
      <circle cx={120} cy={75} r={62} className={SHAPE} strokeWidth={2} />
      <line x1={58} y1={75} x2={182} y2={75} className="stroke-primary" strokeWidth={1.5} strokeDasharray="4 4" />
      <Badge x={120} y={75} letter="D" value={diameter} idPrefix={idPrefix} />
    </Frame>
  );
}

/** Custom shapes: a generic dashed outline, just so the card doesn't jump
 * in height between shapes — no dimensions on it. */
export function OutlinePlaceholder({ label = "Custom shape" }: { label?: string }) {
  return (
    <Frame label={label} height={110}>
      <path
        d="M60 70 C55 30 110 18 140 28 C185 40 200 62 185 85 C168 108 110 104 88 98 C70 93 62 86 60 70 Z"
        className="fill-muted stroke-muted-foreground/40"
        strokeWidth={2}
        strokeDasharray="6 5"
      />
      <text x={122} y={68} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11, fontWeight: 600 }}>
        Described below
      </text>
    </Frame>
  );
}

/**
 * Walkway U: a "]"-shaped path of one width — top leg A, side leg B, bottom
 * leg C, open on the left (or the right when `openRight`, a mirror only).
 * Drawn roughly to proportion from the real lengths (blank legs fall back
 * to a sensible sample shape), so a longer C visibly reaches further. The
 * path width is exaggerated to a readable minimum on a small diagram.
 */
export function PathUDiagram({
  a,
  b,
  c,
  width,
  openRight,
  idPrefix,
}: {
  a: number | null;
  b: number | null;
  c: number | null;
  width: number | null;
  openRight: boolean;
  idPrefix: string;
}) {
  const A = a || 12;
  const B = b || 16;
  const C = c || 12;
  const W = width || 4;
  // Fit the longest horizontal leg into ~150px and B into ~110px.
  const s = Math.min(150 / Math.max(A, C), 110 / B);
  const t = Math.min(Math.max(W * s, 10), 28); // path width, px
  const lb = Math.max(B * s, 2 * t + 8);
  const la = Math.max(A * s, t + 8);
  const lc = Math.max(C * s, t + 8);
  const R = 195; // the closed side
  const T = (160 - lb) / 2;
  const mx = (x: number) => (openRight ? 240 - x : x);
  const pts: [number, number][] = [
    [R - la, T],
    [R, T],
    [R, T + lb],
    [R - lc, T + lb],
    [R - lc, T + lb - t],
    [R - t, T + lb - t],
    [R - t, T + t],
    [R - la, T + t],
  ];
  const d = `M${pts.map(([x, y]) => `${mx(x)} ${y}`).join(" L")} Z`;

  return (
    <Frame label={`U-shaped walkway open to the ${openRight ? "right" : "left"}: legs A (top), B (side), C (bottom)`}>
      <path d={d} className={SHAPE} strokeWidth={2} strokeLinejoin="round" />
      <Badge x={mx(R - la / 2)} y={T - 10} letter="A" value={a} idPrefix={idPrefix} />
      <Badge x={mx(R + 20)} y={T + lb / 2} letter="B" value={b} idPrefix={idPrefix} />
      <Badge x={mx(R - lc / 2)} y={T + lb + 11} letter="C" value={c} idPrefix={idPrefix} />
      {/* Width, marked across the side leg's inner edge. */}
      <Badge x={mx(R - t - 22)} y={T + lb / 2} letter="W" value={width} idPrefix={idPrefix} />
    </Frame>
  );
}
