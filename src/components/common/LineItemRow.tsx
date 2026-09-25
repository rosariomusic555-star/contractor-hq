import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { ChevronDown, ChevronUp, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ActionMenu } from "@/components/responsive/ActionMenu";
import { SheetSelect } from "@/components/responsive/SheetSelect";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
import { ReorderControls } from "@/components/common/ReorderControls";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import { compressImageFile } from "@/lib/imageUpload";
import { getSignedImageUrls, type Category } from "@/lib/api";
import type { DraftLineImage, DraftLineItem } from "@/lib/draftLineItem";

const NONE = "__none__";
const ITEM_FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";
const THUMB_CLASS = "h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted";
const tmpId = () => `tmp-${crypto.randomUUID()}`;

interface LineItemRowProps {
  item: DraftLineItem;
  categories: Category[];
  onEdit: (patch: Partial<DraftLineItem>) => void;
  onDelete: () => void;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  dragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** "Rate ($)" for a quote; overridable for a builder where the sign
   * matters more explicitly (e.g. a change order's credit lines). */
  priceLabel?: string;
  /** Quote-only: the "Optional add-on" checkbox. Omitted entirely (not
   * just hidden) for builders with no optional-item concept, like the
   * Change Order builder. */
  optionalToggle?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
  };
}

/**
 * A single line item's editable card — name, description, category,
 * photos, qty/unit/rate/line-total, and (optionally) a quote-style
 * "optional add-on" toggle. Shared by the Quote builder and the Change
 * Order builder so both edit line items identically; each builder wraps
 * this in its own drag/collapse/section plumbing (see LineItemSectionCard).
 */
export function LineItemRow({
  item,
  categories,
  onEdit,
  onDelete,
  dragHandleProps,
  dragging,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  priceLabel = "Rate ($)",
  optionalToggle,
}: LineItemRowProps) {
  // Local string state so a half-typed number ("1.", "0.0") isn't reformatted
  // out from under the cursor. Re-synced when the draft is reseeded.
  const [qtyStr, setQtyStr] = useState(String(item.quantity));
  const [priceStr, setPriceStr] = useState(String(item.price));
  useEffect(() => setQtyStr(String(item.quantity)), [item.quantity]);
  useEffect(() => setPriceStr(String(item.price)), [item.price]);

  const total = item.quantity * item.price;
  const isCredit = total < 0;

  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border border-hairline p-3 transition-shadow sm:gap-3.5 sm:p-4 hover:border-input hover:shadow-card-hover",
        dragging && "border-primary/40 opacity-90 shadow-card-hover",
      )}
    >
      {/* Item name + handle/arrows + delete — the label sits on its own
          line above; the input, reorder group, and trash share one row so
          the controls center on the input itself (not the label+input
          block), independent of everything below (description, category,
          photos). Textarea so long names wrap and it auto-grows. Phones: the
          name gets the full width and reorder/remove move into a "⋯" menu
          beside the label (the reorder controls stay mounted but hidden —
          the drag handle must exist once; dragging is desktop-only). */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className={ITEM_FIELD_LABEL}>Item</div>
          <ActionMenu
            className="-my-2.5 -mr-2 sm:hidden"
            title={item.name || "Line item"}
            ariaLabel="Line item actions"
            items={[
              { label: "Move up", icon: ChevronUp, onSelect: onMoveUp, disabled: !canMoveUp },
              { label: "Move down", icon: ChevronDown, onSelect: onMoveDown, disabled: !canMoveDown },
              { label: "Remove item", icon: Trash2, onSelect: onDelete, destructive: true, separatorBefore: true },
            ]}
          />
        </div>
        <div className="mt-1 flex items-center gap-3">
          <AutoGrowTextarea
            value={item.name}
            onChange={(e) => onEdit({ name: e.target.value })}
            placeholder="Item name"
            className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-2 text-base font-semibold hover:border-input focus-visible:border-primary sm:text-[15px]"
          />
          <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <ReorderControls
            dragHandleProps={dragHandleProps}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            label={item.name || "item"}
            className="mr-2"
          />
          <button
            type="button"
            onClick={onDelete}
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <div className={ITEM_FIELD_LABEL}>Description</div>
        <AutoGrowTextarea
          value={item.description}
          onChange={(e) => onEdit({ description: e.target.value })}
          placeholder="Short description"
          className="mt-1 min-h-[44px] rounded-xl bg-muted px-3 py-2 text-base text-muted-foreground sm:text-sm hover:border-input focus-visible:border-primary"
        />
      </div>

      {/* Category — optional, its own full-width row so the picked name is
          never truncated/clipped on mobile. */}
      <div>
        <div className={ITEM_FIELD_LABEL}>Category</div>
        <div className="mt-1">
          <SheetSelect
            value={item.category_id ?? NONE}
            onValueChange={(v) => onEdit({ category_id: v === NONE ? null : v })}
            options={[{ value: NONE, label: "Uncategorized" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            placeholder="Uncategorized"
            title="Category"
            ariaLabel="Category"
            triggerClassName="h-11 sm:h-[42px]"
          />
        </div>
      </div>

      {/* Photos — optional, multiple. Part of the draft like every other
          field here: picking a file compresses + previews it locally, and
          it's only uploaded when the whole builder is saved. */}
      <LineItemPhotos item={item} onEdit={onEdit} />

      {/* Qty · Unit / Rate two-up on phones with the line total on its own
          right-aligned row; four-up from sm. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Qty</div>
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            value={qtyStr}
            onChange={(e) => {
              setQtyStr(e.target.value);
              onEdit({ quantity: parseFloat(e.target.value) || 0 });
            }}
            className="mt-1 h-11 tabular-nums sm:h-[42px]"
            aria-label="Quantity"
          />
        </label>
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Unit</div>
          <Input
            value={item.unit}
            onChange={(e) => onEdit({ unit: e.target.value })}
            placeholder="ea"
            className="mt-1 h-11 sm:h-[42px]"
            aria-label="Unit"
          />
        </label>
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>{priceLabel}</div>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={priceStr}
            onChange={(e) => {
              setPriceStr(e.target.value);
              onEdit({ price: parseFloat(e.target.value) || 0 });
            }}
            className="mt-1 h-11 tabular-nums sm:h-[42px]"
            aria-label="Unit price"
          />
        </label>
        <div
          className={cn(
            "col-span-2 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 sm:col-span-1 sm:block sm:rounded-none sm:bg-transparent sm:p-0",
            isCredit ? "bg-destructive/10" : "bg-primary/10",
          )}
        >
          <div className={ITEM_FIELD_LABEL}>Line total</div>
          <div
            className={cn(
              "text-lg font-extrabold tabular-nums sm:mt-1 sm:flex sm:h-[42px] sm:items-center sm:justify-end sm:rounded-md sm:px-3 sm:text-base",
              isCredit ? "text-destructive sm:bg-destructive/10" : "text-success sm:bg-primary/10",
            )}
          >
            {isCredit ? "−" : ""}
            {formatCurrency(Math.abs(total))}
          </div>
        </div>
      </div>

      {/* Optional add-on — quote builder only. */}
      {optionalToggle && (
        <label className="-my-2 flex min-h-11 items-center gap-2 text-[13px] font-medium text-muted-foreground sm:my-0 sm:min-h-0 sm:text-xs">
          <Checkbox checked={optionalToggle.checked} onCheckedChange={(c) => optionalToggle.onChange(c === true)} />
          {optionalToggle.label}
        </label>
      )}
    </div>
  );
}

interface LineItemPhotosProps {
  item: DraftLineItem;
  onEdit: (patch: Partial<DraftLineItem>) => void;
}

/**
 * Fully draft-driven, like every other field on this row — picking a file
 * compresses it immediately (so the preview matches exactly what will be
 * uploaded) and adds it to `item.images` via `onEdit`, same as typing into
 * any other field. Nothing touches Storage until the builder's own Save
 * runs, so this works identically on a brand-new, never-saved line item —
 * there's no server item to attach to yet, and none is needed until save
 * time.
 */
function LineItemPhotos({ item, onEdit }: LineItemPhotosProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxImageId, setLightboxImageId] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  const images = item.images;
  const lightboxImage = images.find((img) => img.id === lightboxImageId) ?? null;

  // Only persisted images need a signed URL — local ones already have their
  // own preview URL (see DraftLineImage).
  const persistedImages = images.filter((img) => img.storage_path && !img.file);
  const paths = persistedImages.map((img) => img.storage_path!);
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["line-item-image-urls", item.id, persistedImages.map((i) => i.id).join(",")],
    queryFn: () => getSignedImageUrls(paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
  });
  const srcFor = (img: DraftLineImage) => img.previewUrl ?? (img.storage_path ? signedUrls[img.storage_path] : undefined);

  const addFiles = async (files: File[]) => {
    setCompressing(true);
    try {
      const added: DraftLineImage[] = [];
      for (const file of files) {
        const compressed = await compressImageFile(file);
        added.push({
          id: tmpId(),
          storage_path: null,
          file: compressed,
          previewUrl: URL.createObjectURL(compressed),
          sort_order: images.length + added.length,
        });
      }
      onEdit({ images: [...images, ...added] });
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setCompressing(false);
    }
  };

  const removeImage = (imageId: string) => {
    const img = images.find((i) => i.id === imageId);
    if (img?.file && img.previewUrl) URL.revokeObjectURL(img.previewUrl);
    onEdit({ images: images.filter((i) => i.id !== imageId) });
    setLightboxImageId(null);
  };

  return (
    <div>
      <div className={ITEM_FIELD_LABEL}>Photos</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setLightboxImageId(img.id)}
            className={cn(THUMB_CLASS, "relative")}
            aria-label="View photo"
          >
            {srcFor(img) ? (
              <img src={srcFor(img)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-subtle" />
              </div>
            )}
          </button>
        ))}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={compressing}
          className={cn(
            THUMB_CLASS,
            "flex items-center justify-center border-[1.5px] border-dashed border-border text-muted-subtle transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-subtle",
          )}
          aria-label="Add photo"
        >
          {compressing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void addFiles(files);
          }}
        />
      </div>

      <Dialog open={!!lightboxImage} onOpenChange={(open) => !open && setLightboxImageId(null)}>
        <DialogContent className="max-w-lg gap-3 p-4">
          <DialogTitle className="text-sm font-bold text-foreground">Photo</DialogTitle>
          {lightboxImage && (
            <>
              {srcFor(lightboxImage) ? (
                <img src={srcFor(lightboxImage)} alt="" className="max-h-[70vh] w-full rounded-xl object-contain" />
              ) : (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-subtle" />
                </div>
              )}
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => removeImage(lightboxImage.id)}
              >
                <X className="h-4 w-4" />
                Remove photo
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
