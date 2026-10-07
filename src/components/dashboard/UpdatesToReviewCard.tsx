import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getSignedImageUrls, listProgressUpdates, setProgressUpdateShared } from "@/lib/api";
import { useCardLink } from "@/hooks/use-card-link";
import { projectHref } from "@/lib/projectTabs";

/** Dashboard (0126): crew progress posts waiting to be shared — two big
 * buttons each, quick on a phone. Hidden when there's nothing to review. */
export function UpdatesToReviewCard({ className }: { className?: string }) {
  const cardLink = useCardLink("/projects");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: pending = [] } = useQuery({ queryKey: ["progress-updates", "pending"], queryFn: () => listProgressUpdates(undefined, "pending") });
  const paths = pending.flatMap((u) => (u.photos ?? []).slice(0, 1).map((p) => p.storage_path));
  const { data: urls = {} } = useQuery({ queryKey: ["review-thumbs", paths.join(",")], queryFn: () => getSignedImageUrls(paths), enabled: paths.length > 0 });
  const act = useMutation({
    mutationFn: ({ id, share }: { id: string; share: boolean }) => setProgressUpdateShared(id, share),
    onSuccess: (_d, v) => {
      toast({ title: v.share ? "Shared with the client" : "Kept internal" });
      return qc.invalidateQueries({ queryKey: ["progress-updates"] });
    },
    onError: (e: Error) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });
  if (pending.length === 0) return null;
  return (
    <section onClick={cardLink.onClick} className={cn(cardLink.className, "card-surface p-5", className)}>
      <h3 className="text-base font-bold text-foreground">
        Updates to review <span className="text-muted-foreground">· {pending.length}</span>
      </h3>
      <ul className="mt-3 space-y-3">
        {pending.map((u) => {
          const thumb = u.photos?.[0] ? urls[u.photos[0].storage_path] : null;
          return (
            <li key={u.id} className="rounded-xl border border-border p-3">
              <Link to={projectHref(u.project_id, "updates")} className="flex gap-3">
                {thumb && <img src={thumb} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-foreground">{u.project?.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {u.author_name} · {(u.photos ?? []).length} photo{(u.photos ?? []).length === 1 ? "" : "s"}
                    {u.milestone ? ` · ${u.milestone}` : ""}
                  </span>
                  {u.note && <span className="line-clamp-2 block text-sm text-foreground">{u.note}</span>}
                </span>
              </Link>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button className="h-11 font-bold" disabled={act.isPending} onClick={() => act.mutate({ id: u.id, share: true })}>
                  <Check className="mr-1 h-4 w-4" /> Approve & share
                </Button>
                <Button variant="outline" className="h-11" disabled={act.isPending} onClick={() => act.mutate({ id: u.id, share: false })}>
                  Keep internal
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
