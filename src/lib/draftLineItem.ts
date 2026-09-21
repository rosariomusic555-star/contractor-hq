/** The draft line-item/section shapes shared by the Quote builder and the
 * Change Order builder — split into its own module (rather than living in
 * LineItemRow.tsx alongside the component) purely so that file can stay
 * component-only for React Fast Refresh. */

/**
 * A photo on a draft line item — either not yet uploaded (`file` set, a
 * pre-compressed blob held only in memory + `previewUrl`, a local
 * `URL.createObjectURL`) or already persisted (`storage_path` set, `file`
 * null). Nothing in Storage exists for a `file`-backed image until the
 * builder's own Save runs — see each builder's own save mutation.
 */
export interface DraftLineImage {
  id: string;
  storage_path: string | null;
  file: Blob | null;
  previewUrl: string | null;
  sort_order: number;
}

/** The shared shape both the Quote builder and the Change Order builder's
 * line items satisfy — each builder's own draft item type extends this
 * with whatever's specific to it (is_optional/client_selected for quotes;
 * nothing extra for change orders, where a negative price/total already
 * reads as a credit). */
export interface DraftLineItem {
  id: string;
  name: string;
  description: string;
  /** Unit price — negative reads as a credit/removal (change orders only;
   * always ≥0 in practice for quotes). Line total = quantity × price. */
  price: number;
  quantity: number;
  unit: string;
  category_id: string | null;
  images: DraftLineImage[];
}

/** The shared shape both the Quote builder and the Change Order builder's
 * sections satisfy. */
export interface DraftLineSection {
  id: string;
  name: string;
  items: DraftLineItem[];
}

/** Revokes preview URLs for any not-yet-uploaded images on an item — call
 * whenever a draft item is discarded or removed so it doesn't leak. Shared
 * by every builder's discard/remove paths. */
export function revokeLocalImageUrls(item: DraftLineItem) {
  for (const img of item.images) {
    if (img.file && img.previewUrl) URL.revokeObjectURL(img.previewUrl);
  }
}
