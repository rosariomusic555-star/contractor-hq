import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getPortalSignedImageUrls } from "@/lib/portalApi";

interface PortalGalleryPhoto {
  id: string;
  storage_path: string;
  caption: string | null;
}

/**
 * Read-only photo grid + lightbox for the hub — visually mirrors
 * src/components/common/PhotoGallery.tsx's grid/lightbox (same look, same
 * tap-to-enlarge interaction) so a photo reads identically to the
 * contractor-side gallery, but it's a separate component: PhotoGallery's
 * data layer is hard-wired to the CONTRACTOR's own Supabase client
 * (src/lib/supabase.ts), which has no RLS access under a portal session.
 * This one reads through portalSupabase instead (see get_portal_project /
 * getPortalSignedImageUrls). No upload/caption/delete here — the client
 * can't edit project photos (Phase 5 adds client *uploads*, a separate,
 * clearly-labeled "From client" flow, not editing this gallery).
 */
export function PortalPhotoGrid({ photos }: { photos: PortalGalleryPhoto[] }) {
  const [lightboxPhoto, setLightboxPhoto] = useState<PortalGalleryPhoto | null>(null);
  const paths = photos.map((p) => p.storage_path);

  const { data: signedUrls = {} } = useQuery({
    queryKey: ["portal-photo-urls", paths.join(",")],
    queryFn: () => getPortalSignedImageUrls(paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setLightboxPhoto(photo)}
            className="aspect-square overflow-hidden rounded-xl bg-muted"
            aria-label={photo.caption || "View photo"}
          >
            {signedUrls[photo.storage_path] ? (
              <img
                src={signedUrls[photo.storage_path]}
                alt={photo.caption ?? ""}
                className="h-full w-full object-cover transition-transform hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-subtle" />
              </div>
            )}
          </button>
        ))}
      </div>

      <Dialog open={!!lightboxPhoto} onOpenChange={(open) => !open && setLightboxPhoto(null)}>
        <DialogContent className="max-w-lg gap-3 p-4">
          <DialogTitle className="text-sm font-bold text-foreground">Photo</DialogTitle>
          {lightboxPhoto && (
            <>
              {signedUrls[lightboxPhoto.storage_path] ? (
                <img
                  src={signedUrls[lightboxPhoto.storage_path]}
                  alt=""
                  className="max-h-[60vh] w-full rounded-xl object-contain"
                />
              ) : (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-subtle" />
                </div>
              )}
              {lightboxPhoto.caption && <p className="text-sm text-muted-foreground">{lightboxPhoto.caption}</p>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
