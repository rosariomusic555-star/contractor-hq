import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff, ImagePlus, Loader2, Share2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn, pluralize } from "@/lib/utils";
import {
  getSignedImageUrls,
  listProjectImages,
  addProjectImage,
  updateProjectImageCaption,
  deleteProjectImage,
  setProjectImagesClientVisible,
  acceptProjectImage,
  listMaterialOrderImages,
  addMaterialOrderImage,
  updateMaterialOrderImageCaption,
  deleteMaterialOrderImage,
} from "@/lib/api";

export type PhotoOwner = { type: "project"; id: string } | { type: "material_order"; id: string };

/** The subset of ProjectImage/MaterialOrderImage this gallery actually
 * needs — both satisfy it structurally, so the same rendering code works
 * for either owner type without a shared DB table. `client_visible` is
 * project-images-only (Client Hub, 0064) — undefined for a material-order
 * owner, where delivery photos have no visibility flag at all (always
 * visible in the hub, per spec). */
interface GalleryPhoto {
  id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  client_visible?: boolean;
  /** Client Hub Phase 5 (0067) — project-images-only, same as
   * client_visible. A client-submitted photo starts accepted=false and
   * lives in its own "From client" section (never the main grid) until
   * the contractor accepts it. */
  uploaded_by_client?: boolean;
  accepted?: boolean;
}

interface PhotoGalleryProps {
  owner: PhotoOwner;
  title: string;
  emptyText: string;
  /** Omit the outer card-surface wrapper — for when this is already
   * nested inside another card (e.g. a delivery card) rather than sitting
   * as its own top-level section (e.g. the project page). Everything else
   * — uploader, grid, lightbox, delete flow — is identical either way. */
  bare?: boolean;
}

/**
 * A photo gallery attached to something — a project's progress photos, or
 * a material delivery's proof-of-delivery shots. One component so a photo
 * looks and behaves identically everywhere it's used: same uploader, same
 * thumbnail grid, same lightbox + caption editor, same delete flow.
 * `owner` picks which table/api functions back it (each owner type still
 * gets its own table + storage path prefix, same as every other photo
 * feature in this app — see MaterialOrderImage's doc comment in api.ts) —
 * everything else here is generic. Uploads/deletes/caption edits are real,
 * immediate writes, same as the project gallery always was — there's
 * nothing to "save" about a photo, it either uploaded or it didn't.
 */
export function PhotoGallery({ owner, title, emptyText, bare = false }: PhotoGalleryProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxImage, setLightboxImage] = useState<GalleryPhoto | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");

  const queryKey = ["photo-gallery", owner.type, owner.id];
  const list = () => (owner.type === "project" ? listProjectImages(owner.id) : listMaterialOrderImages(owner.id));
  const addOne = (file: File, sort_order: number) =>
    owner.type === "project"
      ? addProjectImage(owner.id, file, { sort_order })
      : addMaterialOrderImage(owner.id, file, { sort_order });
  const updateCaption = (id: string, caption: string | null) =>
    owner.type === "project" ? updateProjectImageCaption(id, caption) : updateMaterialOrderImageCaption(id, caption);
  const remove = (image: GalleryPhoto) =>
    owner.type === "project" ? deleteProjectImage(image) : deleteMaterialOrderImage(image);

  const { data: allImages = [], isLoading } = useQuery({ queryKey, queryFn: list });
  // A client-submitted photo (Phase 5) never appears in the main grid —
  // it lives in its own "From client" section below until accepted.
  const images = allImages.filter((i) => i.accepted !== false);
  const pendingImages =
    owner.type === "project" ? allImages.filter((i) => i.uploaded_by_client && i.accepted === false) : [];

  const paths = allImages.map((i) => i.storage_path);
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["photo-gallery-urls", owner.type, owner.id, images.map((i) => i.id).join(",")],
    queryFn: () => getSignedImageUrls(paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const uploadMut = useMutation({
    mutationFn: async (files: File[]) => {
      for (let i = 0; i < files.length; i++) {
        await addOne(files[i], images.length + i);
      }
    },
    onSuccess: invalidate,
    onError,
  });

  const captionMut = useMutation({
    mutationFn: ({ id, caption }: { id: string; caption: string | null }) => updateCaption(id, caption),
    onSuccess: invalidate,
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: (image: GalleryPhoto) => remove(image),
    onSuccess: () => {
      setLightboxImage(null);
      invalidate();
    },
    onError,
  });

  // Client Hub (0064) visibility — project-owned photos only; a
  // material-order (delivery) gallery has no visibility flag at all, so
  // these are simply never called for that owner type.
  const visibilityMut = useMutation({
    mutationFn: ({ ids, visible }: { ids: string[]; visible: boolean }) =>
      setProjectImagesClientVisible(ids, visible),
    onSuccess: (_data, { visible }) => {
      invalidate();
      if (lightboxImage) setLightboxImage((img) => (img ? { ...img, client_visible: visible } : img));
    },
    onError,
  });
  const hiddenCount = owner.type === "project" ? images.filter((i) => !i.client_visible).length : 0;

  // Client Hub Phase 5 — moves a client-submitted photo into the regular
  // gallery. Still starts hidden from the client (see acceptProjectImage's
  // own doc comment) — accepting isn't the same as sharing it back.
  const acceptMut = useMutation({
    mutationFn: (id: string) => acceptProjectImage(id),
    onSuccess: invalidate,
    onError,
  });

  const openLightbox = (img: GalleryPhoto) => {
    setLightboxImage(img);
    setCaptionDraft(img.caption ?? "");
  };

  const saveCaption = () => {
    if (!lightboxImage) return;
    const trimmed = captionDraft.trim();
    if (trimmed !== (lightboxImage.caption ?? "")) {
      captionMut.mutate({ id: lightboxImage.id, caption: trimmed || null });
    }
  };

  return (
    <section className={cn(!bare && "card-surface p-5")}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <div className="flex shrink-0 items-center gap-3">
          {owner.type === "project" && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => visibilityMut.mutate({ ids: images.map((i) => i.id), visible: true })}
              disabled={visibilityMut.isPending}
              className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline disabled:opacity-50"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share all with client
            </button>
          )}
          {images.length > 0 && (
            <span className="text-[13px] font-semibold text-muted-foreground">
              {pluralize(images.length, "photo")}
            </span>
          )}
        </div>
      </div>
      {owner.type === "project" && images.length > 0 && (
        <p className="mt-1 text-[11px] text-muted-subtle">
          {hiddenCount === 0
            ? "All photos are visible to the client."
            : hiddenCount === images.length
              ? "Hidden from the client — tap the eye icon on a photo to share it."
              : `${pluralize(images.length - hiddenCount, "photo")} visible to the client.`}
        </p>
      )}

      {pendingImages.length > 0 && (
        <div className="mt-3 rounded-xl border-[1.5px] border-dashed border-warning/40 bg-warning/5 p-3">
          <p className="text-xs font-bold text-warning">
            From client — {pluralize(pendingImages.length, "photo")} awaiting review
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
            {pendingImages.map((img) => (
              <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
                {signedUrls[img.storage_path] ? (
                  <img
                    src={signedUrls[img.storage_path]}
                    alt={img.caption ?? ""}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-subtle" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 p-1">
                  <button
                    type="button"
                    onClick={() => acceptMut.mutate(img.id)}
                    disabled={acceptMut.isPending}
                    aria-label="Accept photo"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate(img)}
                    disabled={deleteMut.isPending}
                    aria-label="Reject photo"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white hover:bg-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : images.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyText}</p>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => openLightbox(img)}
            className="group relative aspect-square overflow-hidden rounded-xl bg-muted"
            aria-label={img.caption || "View photo"}
          >
            {signedUrls[img.storage_path] ? (
              <img
                src={signedUrls[img.storage_path]}
                alt={img.caption ?? ""}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-subtle" />
              </div>
            )}
            {owner.type === "project" && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  visibilityMut.mutate({ ids: [img.id], visible: !img.client_visible });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    visibilityMut.mutate({ ids: [img.id], visible: !img.client_visible });
                  }
                }}
                aria-label={img.client_visible ? "Hide from client" : "Share with client"}
                className={cn(
                  "absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full backdrop-blur-sm transition-colors",
                  img.client_visible
                    ? "bg-primary/90 text-primary-foreground"
                    : "bg-black/50 text-white/90 hover:bg-black/70",
                )}
              >
                {img.client_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </span>
            )}
          </button>
        ))}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMut.isPending}
          className="flex aspect-square items-center justify-center rounded-xl border-[1.5px] border-dashed border-border text-muted-subtle transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Add photos"
        >
          {uploadMut.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
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
            if (files.length) uploadMut.mutate(files);
          }}
        />
      </div>

      <Dialog
        open={!!lightboxImage}
        onOpenChange={(open) => {
          if (!open) {
            saveCaption();
            setLightboxImage(null);
          }
        }}
      >
        <DialogContent className="max-w-lg gap-3 p-4">
          <DialogTitle className="text-sm font-bold text-foreground">Photo</DialogTitle>
          {lightboxImage && (
            <>
              {signedUrls[lightboxImage.storage_path] ? (
                <img
                  src={signedUrls[lightboxImage.storage_path]}
                  alt=""
                  className="max-h-[60vh] w-full rounded-xl object-contain"
                />
              ) : (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-subtle" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="image-caption" className="text-xs font-semibold text-muted-foreground">
                  Caption
                </Label>
                <Input
                  id="image-caption"
                  value={captionDraft}
                  onChange={(e) => setCaptionDraft(e.target.value)}
                  onBlur={saveCaption}
                  placeholder="Add a caption…"
                />
              </div>
              {owner.type === "project" && (
                <Button
                  variant="outline"
                  onClick={() =>
                    visibilityMut.mutate({ ids: [lightboxImage.id], visible: !lightboxImage.client_visible })
                  }
                  disabled={visibilityMut.isPending}
                >
                  {lightboxImage.client_visible ? (
                    <>
                      <EyeOff className="h-4 w-4" />
                      Hide from client
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      Share with client
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => deleteMut.mutate(lightboxImage)}
                disabled={deleteMut.isPending}
              >
                <Trash2 className="h-4 w-4" />
                {deleteMut.isPending ? "Removing…" : "Delete photo"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
