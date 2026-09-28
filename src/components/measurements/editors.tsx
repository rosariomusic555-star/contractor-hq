import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FIXTURE_TYPES,
  isLengthFixture,
  RUN_COUNT,
  RUN_LAYOUTS,
  activeRuns,
  areaRectStyle,
  areaShapesFor,
  computeTotals,
  fmt,
  lShapeArea,
  newId,
  pathUArea,
  runLetter,
  uShapeArea,
  type FeatureData,
  type FeatureKind,
  type FirePitData,
  type FireplaceData,
  type FixtureType,
  type KitchenData,
  type LightingData,
  type MeasurementDefaults,
  type PatioData,
  type RetainingWallData,
  type Run,
  type RunLayout,
  type SeatingWallData,
  type StepsData,
} from "@/lib/measurements";
import { AddLink, Computed, DefaultableHeightField, NumField, RemoveButton, Segmented, SubRow, TextField, ToggleSection, Warning } from "./fields";
import { ArrowLeftRight } from "lucide-react";
import { CircleDiagram, LShapeDiagram, OutlinePlaceholder, PathUDiagram, RectDiagram, RunDiagram, UShapeDiagram } from "./diagrams";

/**
 * One editor per feature kind — the inside of one instance on a feature
 * card. Each is controlled: `data` in, a whole new `data` out. All the math
 * comes from src/lib/measurements.ts (computeTotals etc.) so what's shown
 * here is exactly what's stored in `totals` and read by Smart Section /
 * Quick Quote.
 */

interface EditorProps<T> {
  data: T;
  onChange: (data: T) => void;
  /** Unique per instance — prefixes input ids (diagram badges focus them). */
  idPrefix: string;
}

export function FeatureEditor({
  kind,
  buildType,
  data,
  onChange,
  idPrefix,
  defaults,
}: {
  kind: FeatureKind;
  /** Walkway vs Driveway share a kind but not every shape/diagram. */
  buildType: string | null;
  data: FeatureData;
  onChange: (data: FeatureData) => void;
  idPrefix: string;
  /** The contractor's resolved default heights (fire pit, kitchen counter). */
  defaults: Required<MeasurementDefaults>;
}) {
  const props = { onChange, idPrefix } as { onChange: (d: never) => void; idPrefix: string };
  switch (kind) {
    case "patio":
    case "flatwork":
      return <AreaBuilder kind={kind} buildType={buildType} data={data as PatioData} {...props} />;
    case "kitchen":
      return <KitchenEditor data={data as KitchenData} {...props} defaultHeightIn={defaults.kitchenHeightIn} />;
    case "seating_wall":
      return <SeatingWallEditor data={data as SeatingWallData} {...props} />;
    case "retaining_wall":
      return <RetainingWallEditor data={data as RetainingWallData} {...props} />;
    case "fire_pit":
      return <FirePitEditor data={data as FirePitData} {...props} defaultHeightIn={defaults.firePitHeightIn} />;
    case "fireplace":
      return <FireplaceEditor data={data as FireplaceData} {...props} />;
    case "lighting":
      return <LightingEditor data={data as LightingData} {...props} />;
    case "steps":
      return <StepsEditor data={data as StepsData} {...props} />;
  }
}

const METHOD_OPTIONS = [
  { value: "dimensions" as const, label: "Dimensions" },
  { value: "total" as const, label: "Total sq ft" },
];

// ---------------------------------------------------------------------------
// Area builder — Paver Patio, Walkway, Driveway
// ---------------------------------------------------------------------------

/** L-shape edge names: a patio is measured as a block with a corner cut
 * out; a walkway/driveway as two legs, where C and D are the legs' widths. */
const L_LABELS: Record<"patio" | "flatwork", [keyof PatioData["l"], string][]> = {
  patio: [
    ["a", "A · Bottom (full length)"],
    ["b", "B · Left (full depth)"],
    ["c", "C · Top"],
    ["d", "D · Right"],
  ],
  flatwork: [
    ["a", "A · Bottom leg"],
    ["b", "B · Side leg"],
    ["c", "C · Side leg width"],
    ["d", "D · Bottom leg width"],
  ],
};

/** One builder for every area feature: Dimensions (shape + diagram) or
 * Total sq ft. `kind` + `buildType` pick the shape list (areaShapesFor),
 * edge labels, and how the Straight rectangle is drawn (areaRectStyle). */
function AreaBuilder({
  kind,
  buildType,
  data,
  onChange,
  idPrefix,
}: EditorProps<PatioData> & { kind: "patio" | "flatwork"; buildType: string | null }) {
  const set = (patch: Partial<PatioData>) => onChange({ ...data, ...patch });
  const area = computeTotals(kind, data).area_sqft ?? 0;
  const shapes = areaShapesFor(kind, buildType);
  // A shape this feature doesn't offer (shouldn't happen) falls back to the first.
  const shape = shapes.some((o) => o.value === data.shape) ? data.shape : shapes[0].value;

  return (
    <div className="space-y-3">
      <Segmented ariaLabel="Measure by" value={data.method} options={METHOD_OPTIONS} onChange={(method) => set({ method })} />

      {data.method === "total" ? (
        <NumField label="Total area" suffix="sq ft" value={data.total_sqft} onChange={(total_sqft) => set({ total_sqft })} />
      ) : (
        <>
          <Segmented
            ariaLabel="Shape"
            value={shape}
            options={shapes}
            onChange={(next) => set({ shape: next })}
            className={shapes.length === 4 ? "grid grid-cols-2 sm:flex" : undefined}
          />

          {shape === "rectangle" && (
            <>
              <RectDiagram length={data.rect.length_ft} width={data.rect.width_ft} idPrefix={idPrefix} proportion={areaRectStyle(buildType)} />
              <div className="grid grid-cols-2 gap-3">
                <NumField id={`${idPrefix}-l`} label="Length" suffix="ft" value={data.rect.length_ft} onChange={(length_ft) => set({ rect: { ...data.rect, length_ft } })} />
                <NumField id={`${idPrefix}-w`} label="Width" suffix="ft" value={data.rect.width_ft} onChange={(width_ft) => set({ rect: { ...data.rect, width_ft } })} />
              </div>
              {area > 0 && (
                <Computed>
                  {fmt(data.rect.length_ft)} ft × {fmt(data.rect.width_ft)} ft = {fmt(area)} sq ft
                </Computed>
              )}
            </>
          )}

          {shape === "l_shape" && (
            <>
              <LShapeDiagram v={data.l} idPrefix={idPrefix} />
              {kind === "flatwork" && (
                <p className="text-xs text-muted-foreground">A and B are each leg's outside length, corner included; C and D are how wide each leg is.</p>
              )}
              <div className="grid grid-cols-2 items-end gap-3">
                {L_LABELS[kind].map(([k, label]) => (
                  <NumField key={k} id={`${idPrefix}-${k}`} label={label} suffix="ft" value={data.l[k]} onChange={(v) => set({ l: { ...data.l, [k]: v } })} />
                ))}
              </div>
              {!lShapeArea(data.l).valid && <Warning>C can't be longer than A, and D can't be longer than B.</Warning>}
              {area > 0 && (
                <Computed>
                  {fmt(data.l.c)} × {fmt(data.l.b)} + {fmt(Math.max((data.l.a ?? 0) - (data.l.c ?? 0), 0))} × {fmt(data.l.d)} = {fmt(area)} sq ft
                </Computed>
              )}
            </>
          )}

          {shape === "u_shape" && kind === "flatwork" && (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">Measure each leg along its outer edge.</p>
                <button
                  type="button"
                  onClick={() => set({ path_u: { ...data.path_u, open_right: !data.path_u.open_right } })}
                  aria-label={`Flip diagram to open ${data.path_u.open_right ? "left" : "right"}`}
                  className="-mt-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-xs font-bold text-primary hover:underline"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" /> Flip
                </button>
              </div>
              <PathUDiagram
                a={data.path_u.a}
                b={data.path_u.b}
                c={data.path_u.c}
                width={data.path_u.width}
                openRight={data.path_u.open_right}
                idPrefix={idPrefix}
              />
              <div className="grid grid-cols-2 items-end gap-3">
                {(
                  [
                    ["a", "A · Top leg"],
                    ["b", "B · Side leg"],
                    ["c", "C · Bottom leg"],
                    ["w", "Walkway width"],
                  ] as const
                ).map(([k, label]) => {
                  const field = k === "w" ? "width" : k;
                  return (
                    <NumField
                      key={k}
                      id={`${idPrefix}-${k}`}
                      label={label}
                      suffix="ft"
                      value={data.path_u[field]}
                      onChange={(v) => set({ path_u: { ...data.path_u, [field]: v } })}
                    />
                  );
                })}
              </div>
              {!pathUArea(data.path_u).valid && (
                <Warning>A and C must each be at least one width long, and B at least two widths.</Warning>
              )}
              {area > 0 && (
                <Computed>
                  A {fmt(data.path_u.a)} ft + B {fmt(data.path_u.b)} ft + C {fmt(data.path_u.c)} ft · {fmt(data.path_u.width)} ft wide ={" "}
                  {fmt(area)} sq ft
                </Computed>
              )}
            </>
          )}

          {shape === "u_shape" && kind === "patio" && (
            <>
              <UShapeDiagram v={data.u} idPrefix={idPrefix} />
              <div className="grid grid-cols-2 items-end gap-3">
                {(
                  [
                    ["a", "A · Bottom (full length)"],
                    ["b", "B · Left"],
                    ["c", "C · Left arm top"],
                    ["d", "D · Right"],
                    ["e", "E · Right arm top"],
                    ["f", "F · Base depth"],
                  ] as const
                ).map(([k, label]) => (
                  <NumField key={k} id={`${idPrefix}-${k}`} label={label} suffix="ft" value={data.u[k]} onChange={(v) => set({ u: { ...data.u, [k]: v } })} />
                ))}
              </div>
              {!uShapeArea(data.u).valid && <Warning>C + E can't be longer than A, and F can't be deeper than B or D.</Warning>}
              {area > 0 && <Computed>Left arm + right arm + base = {fmt(area)} sq ft</Computed>}
            </>
          )}

          {shape === "irregular" && (
            <>
              <p className="text-xs text-muted-foreground">Break it into rectangles and add them up.</p>
              {data.areas.map((r, i) => (
                <SubRow key={r.id}>
                  <div className="flex items-center gap-2">
                    <TextField
                      value={r.label}
                      onChange={(label) => set({ areas: data.areas.map((x) => (x.id === r.id ? { ...x, label } : x)) })}
                      placeholder={`Area ${i + 1}`}
                      ariaLabel={`Area ${i + 1} label`}
                      className="flex-1"
                    />
                    {data.areas.length > 1 && (
                      <RemoveButton label={`Remove area ${i + 1}`} onClick={() => set({ areas: data.areas.filter((x) => x.id !== r.id) })} />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumField label="Length" suffix="ft" value={r.length_ft} onChange={(length_ft) => set({ areas: data.areas.map((x) => (x.id === r.id ? { ...x, length_ft } : x)) })} />
                    <NumField label="Width" suffix="ft" value={r.width_ft} onChange={(width_ft) => set({ areas: data.areas.map((x) => (x.id === r.id ? { ...x, width_ft } : x)) })} />
                  </div>
                </SubRow>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-x-4">
                <AddLink onClick={() => set({ areas: [...data.areas, { id: newId(), label: "", length_ft: null, width_ft: null }] })}>
                  Add area
                </AddLink>
                <button type="button" onClick={() => set({ method: "total" })} className="min-h-11 text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline">
                  Know the total? Enter sq ft
                </button>
              </div>
              {area > 0 && (
                <Computed>
                  {data.areas.filter((r) => (r.length_ft ?? 0) * (r.width_ft ?? 0) > 0).length > 1 ? "Areas combined" : "Area"} = {fmt(area)} sq ft
                </Computed>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run builder — Outdoor Kitchen, Seating Wall
// ---------------------------------------------------------------------------

/** Layout + diagram + a length per run + the LF sum. Shared by every
 * run-based feature so they behave the same; `layouts` picks which
 * layouts it offers (RUN_LAYOUTS). `after` is appended to the total line
 * (e.g. " · 36 in high"). */
function RunBuilder({
  layout,
  runs: allRuns,
  layouts,
  onChange,
  idPrefix,
  after,
}: {
  layout: RunLayout;
  runs: Run[];
  layouts: { value: RunLayout; label: string }[];
  onChange: (patch: { layout?: RunLayout; runs?: Run[] }) => void;
  idPrefix: string;
  after?: string;
}) {
  const runs = activeRuns({ layout, runs: allRuns });
  const setRun = (id: string, length_ft: number | null) =>
    onChange({ runs: allRuns.map((r) => (r.id === id ? { ...r, length_ft } : r)) });
  const total = runs.reduce((s, r) => s + (r.length_ft ?? 0), 0);
  const filled = runs.map((r, i) => ({ r, i })).filter(({ r }) => (r.length_ft ?? 0) > 0);
  const runLabel = (r: Run, i: number) =>
    layout === "curved" ? "Length along the curve" : `Run ${runLetter(i)}${r.label?.trim() ? ` · ${r.label.trim()}` : ""}`;

  return (
    <div className="space-y-3">
      <Segmented
        ariaLabel="Layout"
        value={layout}
        options={layouts}
        onChange={(next) => onChange({ layout: next })}
        // 4 layouts → 2×2 on phones; 5 → 3 + 2.
        className={layouts.length === 5 ? "grid grid-cols-3 sm:flex" : layouts.length === 4 ? "grid grid-cols-2 sm:flex" : undefined}
      />
      {layout !== "custom" && <RunDiagram layout={layout} runs={runs.map((r) => r.length_ft)} idPrefix={idPrefix} />}
      <div className={layout === "custom" ? "space-y-2" : "grid grid-cols-2 gap-3 sm:grid-cols-3"}>
        {runs.map((r, i) =>
          layout === "custom" ? (
            <div key={r.id} className="flex items-end gap-2">
              <NumField id={`${idPrefix}-${runLetter(i).toLowerCase()}`} label={runLabel(r, i)} suffix="ft" value={r.length_ft} onChange={(v) => setRun(r.id, v)} className="flex-1" />
              {runs.length > 1 && (
                <RemoveButton label={`Remove run ${runLetter(i)}`} onClick={() => onChange({ runs: allRuns.filter((x) => x.id !== r.id) })} />
              )}
            </div>
          ) : (
            <NumField
              key={r.id}
              id={`${idPrefix}-${runLetter(i).toLowerCase()}`}
              label={runLabel(r, i)}
              suffix="ft"
              value={r.length_ft}
              onChange={(v) => setRun(r.id, v)}
              className={layout === "curved" ? "col-span-2 sm:col-span-3" : undefined}
            />
          ),
        )}
      </div>
      {layout === "custom" && (
        <AddLink onClick={() => onChange({ runs: [...allRuns, { id: newId(), length_ft: null, label: "" }] })}>Add run</AddLink>
      )}
      {total > 0 && (
        <Computed>
          {filled.length > 1 ? `${filled.map(({ r, i }) => `Run ${runLetter(i)} ${fmt(r.length_ft)} ft`).join(" + ")} = ` : ""}
          {fmt(total)} LF
          {after}
        </Computed>
      )}
      {layout !== "custom" && allRuns.slice(RUN_COUNT[layout]).some((r) => (r.length_ft ?? 0) > 0) && (
        <p className="text-xs text-muted-foreground">Runs beyond this layout are kept but not counted.</p>
      )}
    </div>
  );
}

function KitchenEditor({ data, onChange, idPrefix, defaultHeightIn }: EditorProps<KitchenData> & { defaultHeightIn: number }) {
  const totals = computeTotals("kitchen", data, { kitchenHeightIn: defaultHeightIn });
  const height = totals.height_in;
  return (
    <div className="space-y-3">
      <RunBuilder
        layout={data.layout}
        runs={data.runs}
        layouts={RUN_LAYOUTS.kitchen}
        onChange={(patch) => onChange({ ...data, ...(patch as Partial<KitchenData>) })}
        idPrefix={idPrefix}
        after={height ? ` · ${fmt(height)} in high` : ""}
      />
      <DefaultableHeightField label="Counter height" value={data.height_in} defaultValue={defaultHeightIn} onChange={(height_in) => onChange({ ...data, height_in })} />
      <ToggleSection label="Backsplash" checked={data.backsplash} onCheckedChange={(backsplash) => onChange({ ...data, backsplash })}>
        <NumField
          label="Length"
          suffix="ft"
          placeholder={totals.linear_ft ? fmt(totals.linear_ft) : "counter"}
          value={data.backsplash_length_ft}
          onChange={(backsplash_length_ft) => onChange({ ...data, backsplash_length_ft })}
        />
        <NumField label="Height" suffix="in" placeholder="e.g. 18" value={data.backsplash_height_in} onChange={(backsplash_height_in) => onChange({ ...data, backsplash_height_in })} />
        <p className="w-full text-xs text-muted-foreground">Blank length = the whole counter run.</p>
        {totals.backsplash_sqft ? <Computed>{fmt(totals.backsplash_sqft)} sq ft backsplash</Computed> : null}
      </ToggleSection>
    </div>
  );
}

function SeatingWallEditor({ data, onChange, idPrefix }: EditorProps<SeatingWallData>) {
  const totals = computeTotals("seating_wall", data);
  return (
    <div className="space-y-3">
      <NumField label="Height" suffix="in" placeholder="e.g. 20" value={data.height_in} onChange={(height_in) => onChange({ ...data, height_in })} />
      <RunBuilder
        layout={data.layout}
        runs={data.runs}
        layouts={RUN_LAYOUTS.seating_wall}
        onChange={(patch) => onChange({ ...data, ...patch })}
        idPrefix={idPrefix}
        after={data.height_in ? ` · ${fmt(data.height_in)} in high` : ""}
      />
      <ToggleSection label="Backrest" checked={data.backrest} onCheckedChange={(backrest) => onChange({ ...data, backrest })}>
        <NumField
          label="Length"
          suffix="ft"
          placeholder={totals.linear_ft ? fmt(totals.linear_ft) : "wall"}
          value={data.backrest_length_ft}
          onChange={(backrest_length_ft) => onChange({ ...data, backrest_length_ft })}
        />
        <NumField label="Height above seat" suffix="in" placeholder="e.g. 18" value={data.backrest_height_in} onChange={(backrest_height_in) => onChange({ ...data, backrest_height_in })} />
        <p className="w-full text-xs text-muted-foreground">Blank length = the whole wall.</p>
        {totals.backrest_lf ? (
          <Computed>
            {fmt(totals.backrest_lf)} LF backrest · {fmt(totals.backrest_height_in)} in above the seat
          </Computed>
        ) : null}
      </ToggleSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Retaining Wall
// ---------------------------------------------------------------------------

function RetainingWallEditor({ data, onChange, idPrefix }: EditorProps<RetainingWallData>) {
  const set = (patch: Partial<RetainingWallData>) => onChange({ ...data, ...patch });
  const t = computeTotals("retaining_wall", data);
  return (
    <div className="space-y-3">
      <Segmented
        ariaLabel="Measure by"
        value={data.method}
        options={[
          { value: "lf_height", label: "LF × Height" },
          { value: "wall_sqft", label: "Wall sq ft" },
        ]}
        onChange={(method) => set({ method })}
      />
      {data.method === "lf_height" ? (
        <>
          <NumField label="Average height" suffix="ft" value={data.height_ft} onChange={(height_ft) => set({ height_ft })} />
          <RunBuilder
            layout={data.layout}
            runs={data.runs}
            layouts={RUN_LAYOUTS.retaining_wall}
            onChange={(patch) => set(patch)}
            idPrefix={idPrefix}
            // "40 LF × 3 ft = 120 wall sq ft" once there's a height.
            after={t.wall_sqft ? ` × ${fmt(data.height_ft)} ft = ${fmt(t.wall_sqft)} wall sq ft` : ""}
          />
        </>
      ) : (
        <NumField label="Wall face area" suffix="sq ft" value={data.wall_sqft} onChange={(wall_sqft) => set({ wall_sqft })} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fire Pit
// ---------------------------------------------------------------------------

function FirePitEditor({ data, onChange, idPrefix, defaultHeightIn }: EditorProps<FirePitData> & { defaultHeightIn: number }) {
  const set = (patch: Partial<FirePitData>) => onChange({ ...data, ...patch });
  const t = computeTotals("fire_pit", data, { firePitHeightIn: defaultHeightIn });

  return (
    <div className="space-y-3">
      <Segmented
        ariaLabel="Fire pit shape"
        value={data.shape}
        options={[
          { value: "round", label: "Round" },
          { value: "rect", label: "Square / Rect" },
          { value: "custom", label: "Custom" },
        ]}
        onChange={(shape) => set({ shape })}
      />
      {data.shape === "round" && (
        <>
          <CircleDiagram diameter={data.diameter_ft} idPrefix={idPrefix} />
          <NumField id={`${idPrefix}-d`} label="D · Diameter (outside)" suffix="ft" value={data.diameter_ft} onChange={(diameter_ft) => set({ diameter_ft })} />
        </>
      )}
      {data.shape === "rect" && (
        <>
          <RectDiagram length={data.length_ft} width={data.width_ft} idPrefix={idPrefix} />
          <div className="grid grid-cols-2 gap-3">
            <NumField id={`${idPrefix}-l`} label="Length" suffix="ft" value={data.length_ft} onChange={(length_ft) => set({ length_ft })} />
            <NumField id={`${idPrefix}-w`} label="Width" suffix="ft" value={data.width_ft} onChange={(width_ft) => set({ width_ft })} />
          </div>
        </>
      )}
      {data.shape === "custom" && (
        <>
          <OutlinePlaceholder label="Custom fire pit shape" />
          <Textarea
            value={data.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Describe it — e.g. keyhole, built into the seat wall"
            aria-label="Fire pit description"
            rows={2}
            className="text-base"
          />
          <NumField label="Approx. size (optional)" suffix="sq ft" value={data.approx_sqft} onChange={(approx_sqft) => set({ approx_sqft })} />
        </>
      )}

      <DefaultableHeightField value={data.height_in} defaultValue={defaultHeightIn} onChange={(height_in) => set({ height_in })} />

      {(t.footprint_sqft ?? 0) > 0 && (
        <Computed>
          {data.shape === "round" && t.perimeter_ft
            ? `${fmt(data.diameter_ft)} ft across → ${fmt(t.perimeter_ft)} LF around · ${fmt(t.footprint_sqft)} sq ft footprint`
            : data.shape === "rect" && t.perimeter_ft
              ? `${fmt(data.length_ft)} × ${fmt(data.width_ft)} → ${fmt(t.perimeter_ft)} LF around · ${fmt(t.footprint_sqft)} sq ft footprint`
              : `≈ ${fmt(t.footprint_sqft)} sq ft footprint`}
        </Computed>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fireplace
// ---------------------------------------------------------------------------

function FireplaceEditor({ data, onChange, idPrefix }: EditorProps<FireplaceData>) {
  const set = (patch: Partial<FireplaceData>) => onChange({ ...data, ...patch });
  const t = computeTotals("fireplace", data);
  return (
    <div className="space-y-3">
      <RectDiagram length={data.width_ft} width={data.depth_ft} idPrefix={idPrefix} />
      <div className="flex flex-wrap items-end gap-3">
        <NumField id={`${idPrefix}-w`} label="Width" suffix="ft" value={data.width_ft} onChange={(width_ft) => set({ width_ft })} />
        <NumField id={`${idPrefix}-d`} label="Depth" suffix="ft" value={data.depth_ft} onChange={(depth_ft) => set({ depth_ft })} />
        <NumField id={`${idPrefix}-h`} label="Overall height" suffix="ft" value={data.height_ft} onChange={(height_ft) => set({ height_ft })} />
      </div>
      <Segmented
        ariaLabel="Veneered sides"
        value={data.veneer_sides}
        options={[
          { value: "four", label: "Freestanding (4 sides)" },
          { value: "three", label: "Against a wall (3 sides)" },
        ]}
        onChange={(veneer_sides) => set({ veneer_sides })}
      />
      {(t.footprint_sqft ?? 0) > 0 && (
        <Computed>
          {fmt(t.footprint_sqft)} sq ft footprint{t.wall_sqft ? ` · ${fmt(t.wall_sqft)} sq ft of veneer` : ""}
        </Computed>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outdoor Lighting
// ---------------------------------------------------------------------------

function LightingEditor({ data, onChange }: EditorProps<LightingData>) {
  const setRow = (id: string, patch: Partial<LightingData["fixtures"][number]>) =>
    onChange({ ...data, fixtures: data.fixtures.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const totals = computeTotals("lighting", data);
  const count = totals.fixture_count ?? 0;
  const stripLf = totals.strip_lf ?? 0;

  return (
    <div className="space-y-3">
      {data.fixtures.map((f, i) => (
        <SubRow key={f.id}>
          <div className="flex items-end gap-2">
            <label className="block flex-1 space-y-1">
              <span className="block text-xs font-semibold text-muted-foreground">Fixture type</span>
              <Select
                value={f.type}
                onValueChange={(type) =>
                  // A count and a length don't convert — clear it when switching between them.
                  setRow(f.id, isLengthFixture(type as FixtureType) === isLengthFixture(f.type) ? { type: type as FixtureType } : { type: type as FixtureType, qty: null })
                }
              >
                <SelectTrigger className="h-12 text-base" aria-label={`Fixture ${i + 1} type`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIXTURE_TYPES.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="min-h-11">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {!isLengthFixture(f.type) && <NumField key={`${f.id}-qty`} label="Qty" value={f.qty} onChange={(qty) => setRow(f.id, { qty })} className="w-24 shrink-0" />}
            {data.fixtures.length > 1 && (
              <RemoveButton label={`Remove fixture row ${i + 1}`} onClick={() => onChange({ ...data, fixtures: data.fixtures.filter((x) => x.id !== f.id) })} />
            )}
          </div>
          {isLengthFixture(f.type) && (
            <NumField key={`${f.id}-len`} label="Length" suffix="ft" value={f.qty} onChange={(qty) => setRow(f.id, { qty })} />
          )}
          {f.type === "other" && (
            <TextField value={f.name} onChange={(name) => setRow(f.id, { name })} placeholder="Fixture name — e.g. Well light" ariaLabel={`Fixture ${i + 1} name`} />
          )}
        </SubRow>
      ))}
      <AddLink onClick={() => onChange({ ...data, fixtures: [...data.fixtures, { id: newId(), type: "path", name: "", qty: null }] })}>
        Add fixture type
      </AddLink>
      {(count > 0 || stripLf > 0) && (
        <Computed>
          {[count > 0 ? `${fmt(count)} ${count === 1 ? "fixture" : "fixtures"} total` : null, stripLf > 0 ? `${fmt(stripLf)} LF strip lighting` : null].filter(Boolean).join(" · ")}
        </Computed>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function StepsEditor({ data, onChange }: EditorProps<StepsData>) {
  const setRow = (id: string, patch: Partial<StepsData["sections"][number]>) =>
    onChange({ sections: data.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const t = computeTotals("steps", data);

  return (
    <div className="space-y-3">
      {data.sections.map((s, i) => (
        <SubRow key={s.id}>
          <div className="flex items-center gap-2">
            <TextField value={s.label} onChange={(label) => setRow(s.id, { label })} placeholder={`Step section ${i + 1}`} ariaLabel={`Step section ${i + 1} label`} className="flex-1" />
            {data.sections.length > 1 && (
              <RemoveButton label={`Remove step section ${i + 1}`} onClick={() => onChange({ sections: data.sections.filter((x) => x.id !== s.id) })} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Number of steps" value={s.step_count} onChange={(step_count) => setRow(s.id, { step_count })} />
            <NumField label="Width" suffix="ft" value={s.width_ft} onChange={(width_ft) => setRow(s.id, { width_ft })} />
          </div>
        </SubRow>
      ))}
      <AddLink onClick={() => onChange({ sections: [...data.sections, { id: newId(), label: "", step_count: null, width_ft: null }] })}>
        Add step section
      </AddLink>
      {(t.step_count ?? 0) > 0 && (
        <Computed>
          {fmt(t.step_count)} {t.step_count === 1 ? "step" : "steps"} total
          {t.tread_lf ? ` · ${fmt(t.tread_lf)} LF of tread` : ""}
        </Computed>
      )}
    </div>
  );
}
