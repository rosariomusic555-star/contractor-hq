import { useEffect, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { Input } from "@/components/ui/input";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
import { ReorderControls } from "@/components/common/ReorderControls";
import { SupplierCombobox } from "@/components/common/SupplierCombobox";
import { cn, formatCurrency } from "@/lib/utils";
import { COST_TYPE_LABEL, LUMP_SUM_UNIT, lineCost, type LineCostType } from "@/lib/costPlanMath";

export interface CostLineDraft {
  id: string;
  name: string;
  quantity: number;
  unit_cost: number;
  unit: string;
  vendor: string;
  cost_type: LineCostType;
  /** 0162 — optional description (specs, notes). Internal. */
  internal_description: string;
}

const LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";

const TAG_CLASS: Record<Exclude<LineCostType, "material">, string> = {
  subcontractor: "bg-info/15 text-info",
  equipment: "bg-warning/15 text-warning-strong",
  other: "bg-muted text-muted-foreground",
};

/**
 * A Subcontractor / Equipment / Other line on a Cost plan section — simpler
 * than a material line: description, vendor/sub (optional, the same
 * supplier combobox as material orders), and either a lump sum or
 * qty × rate ("2 days × $450"). No waste %, Catalog, tracking or order
 * sheet. A small type tag makes it easy to spot among material lines.
 */
export function CostLineRow({
  item,
  onEdit,
  onDelete,
  dragHandleProps,
  dragging,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  children,
}: {
  item: CostLineDraft;
  onEdit: (patch: Partial<CostLineDraft>) => void;
  onDelete: () => void;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  dragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Under the amounts — the sales tax strip (0163). */
  children?: ReactNode;
}) {
  const lump = item.unit === LUMP_SUM_UNIT;
  const type = item.cost_type === "material" ? "other" : item.cost_type;

  // Local text so "12." can be typed; re-synced on outside changes.
  const [qtyStr, setQtyStr] = useState(String(item.quantity));
  const [rateStr, setRateStr] = useState(String(item.unit_cost));
  useEffect(() => setQtyStr(String(item.quantity)), [item.quantity]);
  useEffect(() => setRateStr(String(item.unit_cost)), [item.unit_cost]);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-hairline p-4 transition-shadow hover:border-input hover:shadow-card-hover",
        dragging && "border-primary/40 opacity-90 shadow-card-hover",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", TAG_CLASS[type])}>
          {COST_TYPE_LABEL[type]}
        </span>
        <span className="flex-1" />
        <ReorderControls
          dragHandleProps={dragHandleProps}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          label={item.name || "line"}
        />
        <button
          type="button"
          onClick={onDelete}
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remove line"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <label className="block">
          <div className={LABEL}>Item</div>
          <AutoGrowTextarea
            value={item.name}
            onChange={(e) => onEdit({ name: e.target.value })}
            placeholder={type === "subcontractor" ? "e.g. Electrician — outlet at the kitchen" : type === "equipment" ? "e.g. Skid steer rental" : "e.g. Dumpster, permit, porta-john"}
            className="mt-1 min-w-0 rounded-xl bg-muted px-3 py-2 text-[15px] font-semibold"
          />
        </label>
        <div>
          <div className={LABEL}>{type === "subcontractor" ? "Sub" : "Vendor"} (optional)</div>
          <SupplierCombobox value={item.vendor} onChange={(vendor) => onEdit({ vendor })} placeholder="Pick or add…" className="mt-1" />
        </div>
      </div>

      {/* Description (0162) — optional specs / notes; internal. */}
      <AutoGrowTextarea
        value={item.internal_description}
        onChange={(e) => onEdit({ internal_description: e.target.value })}
        placeholder="Description (optional) — scope, notes for the sub"
        aria-label="Description"
        className="-mt-1 min-h-[38px] rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground"
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg bg-muted p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Pricing">
          {(
            [
              ["lump", "Lump sum"],
              ["rate", "Qty × rate"],
            ] as const
          ).map(([mode, label]) => {
            const on = (mode === "lump") === lump;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() =>
                  mode === "lump"
                    ? onEdit({ unit: LUMP_SUM_UNIT, unit_cost: lineCost(item), quantity: 1 })
                    : onEdit({ unit: item.unit === LUMP_SUM_UNIT ? "" : item.unit })
                }
                className={cn("min-h-9 rounded-md px-3", on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
              >
                {label}
              </button>
            );
          })}
        </div>

        {lump ? (
          <label className="block w-40">
            <div className={LABEL}>Amount ($)</div>
            <Input
              type="number"
              step="any"
              inputMode="decimal"
              value={rateStr}
              onChange={(e) => {
                setRateStr(e.target.value);
                onEdit({ unit_cost: parseFloat(e.target.value) || 0, quantity: 1 });
              }}
              className="mt-1 h-[42px]"
            />
          </label>
        ) : (
          <>
            <label className="block w-20">
              <div className={LABEL}>Qty</div>
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                value={qtyStr}
                onChange={(e) => {
                  setQtyStr(e.target.value);
                  onEdit({ quantity: parseFloat(e.target.value) || 0 });
                }}
                className="mt-1 h-[42px]"
              />
            </label>
            <label className="block w-24">
              <div className={LABEL}>Unit</div>
              <Input value={item.unit} onChange={(e) => onEdit({ unit: e.target.value })} placeholder="days" className="mt-1 h-[42px]" />
            </label>
            <label className="block w-28">
              <div className={LABEL}>Rate ($)</div>
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                value={rateStr}
                onChange={(e) => {
                  setRateStr(e.target.value);
                  onEdit({ unit_cost: parseFloat(e.target.value) || 0 });
                }}
                className="mt-1 h-[42px]"
              />
            </label>
          </>
        )}

        <div className="ml-auto">
          <div className={LABEL}>Total</div>
          <div className="mt-1 flex h-[42px] min-w-28 items-center justify-end rounded-md bg-primary/10 px-3 text-base font-extrabold tabular-nums text-success">
            {formatCurrency(lineCost(item))}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
