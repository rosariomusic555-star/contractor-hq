import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { getSignedImageUrls, listPortfolio, removePortfolioItem } from "@/lib/api";

/** Re-encode through a canvas: drops EXIF (incl. GPS) before it leaves the app. */
async function downloadClean(url: string, name: string) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0);
  const clean = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
  if (!clean) throw new Error("Couldn't prepare the image");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(clean);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Portfolio (0126, internal): saved before/after pairs for marketing. */
export function PortfolioView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: items = [] } = useQuery({ queryKey: ["portfolio"], queryFn: listPortfolio });
  const paths = items.flatMap((i) => [i.before?.original_path ?? i.before?.storage_path, i.after?.original_path ?? i.after?.storage_path]).filter(Boolean) as string[];
  const { data: urls = {} } = useQuery({ queryKey: ["portfolio-urls", paths.join(",")], queryFn: () => getSignedImageUrls(paths), enabled: paths.length > 0 });
  const remove = useMutation({ mutationFn: removePortfolioItem, onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio"] }) });

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-5">
      <MobilePageHeader title="Portfolio" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Portfolio</h1>
        <p className="text-sm text-muted-foreground">Before & after pairs for marketing. Downloads have location (GPS) and camera data removed.</p>
      </div>
      {items.length === 0 && <p className="card-surface p-8 text-center text-muted-foreground">Nothing saved yet — use "Save pair to portfolio" on a project's Before & after.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((i) => {
          const b = i.before?.original_path ?? i.before?.storage_path;
          const a = i.after?.original_path ?? i.after?.storage_path;
          const ok = i.project?.client?.marketing_ok;
          return (
            <div key={i.id} className="card-surface space-y-2 p-3">
              <div className="grid grid-cols-2 gap-1">
                {[b, a].map((p, n) => (
                  <div key={n} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                    {p && urls[p] && <img src={urls[p]} alt="" className="h-full w-full object-cover" />}
                    <span className="absolute left-1 top-1 rounded bg-black/50 px-1 text-[10px] font-bold text-white">{n === 0 ? "Before" : "After"}</span>
                  </div>
                ))}
              </div>
              <p className="text-sm font-semibold text-foreground">{i.title ?? i.project?.name}</p>
              <p className={ok ? "text-xs font-semibold text-success" : "text-xs font-semibold text-warning"}>
                {ok ? "Client OK'd marketing use" : "No marketing OK from the client yet"}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void Promise.all(
                      [b, a].map((p, n) => (p && urls[p] ? downloadClean(urls[p], `${(i.title ?? "project").replace(/[^\w-]+/g, "-")}-${n === 0 ? "before" : "after"}.jpg`) : null)),
                    ).catch((e) => toast({ title: "Download failed", description: (e as Error).message, variant: "destructive" }))
                  }
                >
                  <Download className="mr-1 h-3.5 w-3.5" /> Download
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate(i.id)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
