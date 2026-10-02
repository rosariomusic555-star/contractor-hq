import { useId } from "react";
import { getTypeConfig } from "@/lib/typeConfig";
import { ArrowDown, ArrowUp, ChevronDown, MoreHorizontal, Trash2 } from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { CollapsibleBody } from "@/components/common/CollapsibleBody";
import { ReorderControls } from "@/components/common/ReorderControls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CUSTOM_UNITS,
  INSTANCE_NOUN,
  computeTotals,
  featureSummary,
  instanceHasData,
  sumTotals,
  totalsHeadline,
  configTotalsHeadline,
  unitSuffix,
  type FeatureData,
  type FeatureInstance,
  type MeasurementDefaults,
  type MeasurementGroup,
  type MeasurementRow,
} from "@/lib/measurements";
import { cn } from "@/lib/utils";
import { AddLink, NumField, RemoveButton, TextField } from "./fields";
import { FeatureEditor } from "./editors";

/** Reordering a card among the Measurements cards (see ProjectMeasurementsCard). */
export interface FeatureCardReorder {
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

/**
 * One Project type's card: its instances (each with an optional label and
 * the purpose-built editor), "+ Add another …", the rolled-up total, and
 * — secondary, at the bottom — custom measurements. A group with no
 * purpose-built card (`group.kind` null) is custom measurements only.
 *
 * Collapsible from its header only (the whole header row is the toggle;
 * nothing inside the body ever toggles). Collapsed, the header carries a
 * one-line summary (featureSummary) or "Not measured yet".
 */
export function FeatureCard({
  group,
  instances,
  customRows,
  defaults,
  onInstanceChange,
  onAddInstance,
  onRemoveInstance,
  onCustomChange,
  onAddCustom,
  onRemoveCustom,
  collapsed,
  onToggleCollapse,
  reorder,
}: {
  group: MeasurementGroup;
  /** Never empty for a kind group — the parent supplies a blank one. */
  instances: FeatureInstance[];
  customRows: MeasurementRow[];
  /** Contractor default heights (fire pit, kitchen counter). */
  defaults: Required<MeasurementDefaults>;
  onInstanceChange: (id: string, patch: { label?: string; data?: FeatureData }) => void;
  onAddInstance: () => void;
  onRemoveInstance: (id: string) => void;
  onCustomChange: (id: string, patch: Partial<MeasurementRow>) => void;
  /** With a patch: the first edit of the blank placeholder row. */
  onAddCustom: (patch?: Partial<MeasurementRow>) => void;
  onRemoveCustom: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Drag handle + up/down (desktop) / a "⋯" menu (phones). Sits beside the
   * header's toggle, never inside it, so moving a card never collapses it. */
  reorder?: FeatureCardReorder;
}) {
  const bodyId = useId();
  const kind = group.kind;
  const noun = (group.build_type && INSTANCE_NOUN[group.build_type]) || "item";
  const perInstance = kind ? instances.map((i) => computeTotals(kind, i.data, defaults)) : [];
  const rollup =
    kind === "config"
      ? configTotalsHeadline(getTypeConfig(group.category_id), sumTotals(perInstance) as Record<string, number>)
      : kind
        ? totalsHeadline(kind, sumTotals(perInstance))
        : null;
  const multi = instances.length > 1;
  const summary = featureSummary(group, instances, customRows, defaults);

  return (
    <section className="rounded-card border border-border bg-card" aria-label={`${group.title} measurements`}>
      <div className="flex items-center">
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        className="flex min-h-14 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", collapsed && "-rotate-90")} />
        <h4 className="shrink-0 text-[15px] font-bold text-foreground">{group.title}</h4>
        {collapsed ? (
          // Phones: its own line under the name (indented past the chevron)
          // so the numbers aren't truncated away; wider: inline after a dot.
          <span
            className={cn(
              "w-full pl-6 text-sm sm:w-auto sm:min-w-0 sm:flex-1 sm:truncate sm:pl-0",
              summary ? "font-semibold text-foreground/80" : "italic text-muted-subtle",
            )}
          >
            <span className="hidden sm:inline">· </span>
            {summary ?? "Not measured yet"}
          </span>
        ) : (
          rollup && (
            <span className="ml-auto min-w-0 truncate text-sm font-bold text-primary">
              {multi ? "Total " : ""}
              {rollup}
            </span>
          )
        )}
      </button>
      {reorder && (
        <>
          <ReorderControls
            dragHandleProps={reorder.dragHandleProps}
            onMoveUp={reorder.onMoveUp}
            onMoveDown={reorder.onMoveDown}
            canMoveUp={reorder.canMoveUp}
            canMoveDown={reorder.canMoveDown}
            label={group.title}
            className="mr-2 hidden md:flex"
          />
          {/* Phones: moving lives in the "⋯" menu (the grip above is hidden). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${group.title} options`}
                className="mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted md:hidden"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem disabled={!reorder.canMoveUp} onSelect={reorder.onMoveUp}>
                <ArrowUp className="mr-2 h-4 w-4" />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!reorder.canMoveDown} onSelect={reorder.onMoveDown}>
                <ArrowDown className="mr-2 h-4 w-4" />
                Move down
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      </div>

      <CollapsibleBody collapsed={collapsed} id={bodyId}>
        <div className="space-y-3 px-4 pb-4">
          <p className="text-xs text-muted-foreground">Enter exact measurements. Waste and extra material are added in the Cost plan.</p>
          {kind &&
            instances.map((inst, i) => {
              const headline =
                kind === "config"
                  ? configTotalsHeadline(getTypeConfig(group.category_id), perInstance[i] as Record<string, number>)
                  : totalsHeadline(kind, perInstance[i]);
              const canRemove = multi || instanceHasData(kind, inst.data, inst.label);
              return (
                <div key={inst.id} className={cn("space-y-3", multi && "rounded-xl border border-hairline p-3")}>
                  <div className="flex items-center gap-2">
                    <TextField
                      value={inst.label ?? ""}
                      onChange={(label) => onInstanceChange(inst.id, { label })}
                      placeholder={
                        multi
                          ? `${capitalize(noun)} ${i + 1} — label (optional)`
                          : `Label (optional)${LABEL_EXAMPLE[group.build_type ?? ""] ? ` — e.g. ${LABEL_EXAMPLE[group.build_type ?? ""]}` : ""}`
                      }
                      ariaLabel={`${capitalize(noun)} ${i + 1} label`}
                      className="h-11 flex-1 text-sm"
                    />
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => onRemoveInstance(inst.id)}
                        aria-label={multi ? `Remove ${noun} ${i + 1}` : `Clear ${noun}`}
                        title={multi ? `Remove this ${noun}` : `Clear this ${noun}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <FeatureEditor
                    kind={kind}
                    buildType={group.build_type}
                    data={inst.data}
                    onChange={(data) => onInstanceChange(inst.id, { data })}
                    idPrefix={`m-${inst.id}`}
                    defaults={defaults}
                  />
                  {multi && headline && <p className="text-right text-xs font-semibold text-muted-foreground">{headline}</p>}
                </div>
              );
            })}

          {kind && (
            <button
              type="button"
              onClick={onAddInstance}
              className="flex min-h-12 w-full items-center justify-center rounded-xl border border-dashed border-primary/50 text-sm font-bold text-primary transition-colors hover:border-primary hover:bg-primary/5"
            >
              + Add another {noun}
            </button>
          )}

          {/* Custom measurements — informational only, never in a total. */}
          {(customRows.length > 0 || !kind) && (
            <div className="space-y-2 border-t border-hairline pt-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {kind ? "Custom measurements (for reference, not in totals)" : "Measurements"}
              </p>
              {customRows.map((r) => (
                <CustomRow key={r.id} row={r} onChange={(patch) => onCustomChange(r.id, patch)} onRemove={() => onRemoveCustom(r.id)} />
              ))}
              {!kind && customRows.length === 0 && <CustomRow row={null} onChange={(patch) => onAddCustom(patch)} />}
            </div>
          )}
          <AddLink onClick={() => onAddCustom()} className="text-xs text-muted-foreground hover:text-primary">
            Add custom measurement
          </AddLink>
        </div>
      </CollapsibleBody>
    </section>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const LABEL_EXAMPLE: Record<string, string> = {
  paver_patio: "Back patio",
  walkway: "Front walk",
  driveway: "Main drive",
  outdoor_kitchen: "Pool-side kitchen",
  seating_wall: "Around the fire pit",
  retaining_wall: "Side wall",
  fire_pit: "Back corner",
  fireplace: "Patio end",
  outdoor_lighting: "Front beds",
  steps: "Deck steps",
};

/** Label + quantity + unit. `row` null renders an empty row whose first edit
 * creates it. */
function CustomRow({
  row,
  onChange,
  onRemove,
}: {
  row: MeasurementRow | null;
  onChange: (patch: Partial<MeasurementRow>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_7rem_7.5rem_auto]">
      <Input
        value={row?.label ?? ""}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="Label — e.g. Border pavers"
        aria-label="Measurement label"
        autoComplete="off"
        className="col-span-2 h-12 text-base sm:col-span-1"
      />
      <div className="col-span-2 flex gap-2 sm:contents">
        <NumField
          label={<span className="sr-only">Quantity</span>}
          labelClassName="sr-only"
          value={row?.value ?? null}
          onChange={(value) => onChange({ value })}
          placeholder="Qty"
          className="flex-1 space-y-0"
        />
        <Select value={row?.unit ?? "sq_ft"} onValueChange={(unit) => onChange({ unit })}>
          <SelectTrigger className="h-12 w-[7.5rem] shrink-0 text-base" aria-label="Unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CUSTOM_UNITS.map((u) => (
              <SelectItem key={u} value={u} className="min-h-11">
                {unitSuffix(u)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onRemove ? <RemoveButton label="Remove measurement" onClick={onRemove} /> : <span className="w-11 shrink-0" />}
      </div>
    </div>
  );
}
