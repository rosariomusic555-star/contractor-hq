import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
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
  listMaterialOrderImages,
  addMaterialOrderImage,
  updateMaterialOrderImageCaption,
  deleteMaterialOrderImage,
} from "@/lib/api";

export type PhotoOwner = { type: "project"; id: string } | { type: "material_order"; id: string };

/** The subset of ProjectImage/MaterialOrderImage this gallery actually
 * needs — both satisfy it structurally, so the same rendering code works
 * for either owner type without a shared DB table. */
interface GalleryPhoto {
  id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
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

  const { data: images = [], isLoading } = useQuery({ queryKey, queryFn: list });

  const paths = images.map((i) => i.storage_path);
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
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        {images.length > 0 && (
          <span className="text-[13px] font-semibold text-muted-foreground">
            {pluralize(images.length, "photo")}
          </span>
        )}
      </div>

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
            className="group aspect-square overflow-hidden rounded-xl bg-muted"
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
