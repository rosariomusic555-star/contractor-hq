import { useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import {
  getSharedChangeOrder,
  getSignedImageUrls,
  signSharedChangeOrder,
  declineSharedChangeOrder,
  type SharedChangeOrderSection,
} from "@/lib/api";
import { scheduleImpactLabel } from "@/lib/changeOrderImpact";

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f9fa] px-4 py-10">
      <div className="mx-auto max-w-[760px]">{children}</div>
    </div>
  );
}

function CenteredNotice({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center px-4">
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

export default function SharedChangeOrderPage() {
  const { token = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [signerName, setSignerName] = useState("");
  const [declining, setDeclining] = useState(false);
  const [comment, setComment] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shared-change-order", token],
    queryFn: () => getSharedChangeOrder(token),
    enabled: token.length > 0,
  });

  const signMut = useMutation({
    mutationFn: () => signSharedChangeOrder(token, signerName.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-change-order", token] });
      toast({ title: `Change order approved. Thank you, ${signerName.trim()}.` });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const declineMut = useMutation({
    mutationFn: () => declineSharedChangeOrder(token, comment.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-change-order", token] });
      toast({ title: "Change order declined" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const allImagePaths = useMemo(
    () => (data?.sections ?? []).flatMap((s) => s.items.flatMap((i) => (i.images ?? []).map((img) => img.storage_path))),
    [data],
  );
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["shared-change-order-image-urls", token, allImagePaths.join(",")],
    queryFn: () => getSignedImageUrls(allImagePaths),
    enabled: allImagePaths.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  if (!token || isError) return <CenteredNotice>Change order not found.</CenteredNotice>;
  if (isLoading) return <CenteredNotice>Loading change order…</CenteredNotice>;
  if (!data) return <CenteredNotice>Change order not found.</CenteredNotice>;

  const { change_order: co, project, client, sections } = data;
  const isApproved = co.status === "approved";
  const isDeclined = co.status === "declined";
  const isDecided = isApproved || isDeclined;

  return (
    <PageShell>
      <div className="bg-white rounded-xl border border-border/60 shadow-sm p-6 md:p-10 space-y-8">
        <header className="space-y-2">
          <p className="text-sm font-bold tracking-wide text-primary">ContractorPro</p>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <h1 className="min-w-0 text-2xl font-bold text-foreground [overflow-wrap:anywhere]">
              {project ? `${project.name} — Change Order` : "Change Order"}
            </h1>
            {isApproved && <span className="badge-status badge-paid shrink-0">Approved ✓</span>}
            {isDeclined && <span className="badge-status badge-overdue shrink-0">Declined</span>}
          </div>
          {client?.name && <p className="text-muted-foreground [overflow-wrap:anywhere]">Prepared for {client.name}</p>}
        </header>

        <div>
          <p className="text-lg font-semibold text-foreground [overflow-wrap:anywhere]">{co.title}</p>
          {co.description && <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{co.description}</p>}
        </div>

        {sections.length > 0 && (
          <div className="space-y-6">
            {sections.map((section) => (
              <SectionBlock key={section.id} section={section} signedUrls={signedUrls} onImageClick={setLightboxUrl} />
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/40 p-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Change to your contract</span>
            <span className={cn("text-xl font-bold", co.amount < 0 ? "text-destructive" : "text-foreground")}>
              {co.amount >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(co.amount))}
            </span>
          </div>
          {!!co.schedule_impact_days && (
            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-muted-foreground">Schedule impact</span>
              <span className="font-semibold text-foreground">{scheduleImpactLabel(co.schedule_impact_days)}</span>
            </div>
          )}
        </div>

        {isApproved ? (
          <div className="rounded-xl border border-success/30 bg-success/10 p-5">
            <p className="font-semibold text-success">Approved ✓</p>
            <p className="text-sm text-foreground mt-1">
              Approved by {co.signed_by ?? "the client"}
              {co.signed_at &&
                ` on ${new Date(co.signed_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`}
            </p>
          </div>
        ) : isDeclined ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5">
            <p className="font-semibold text-destructive">Declined</p>
          </div>
        ) : !declining ? (
          <div className="space-y-4 border-t border-border pt-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Review this change order</h2>
              <p className="text-sm text-muted-foreground mt-1">
                By signing below, you confirm you have read and agree to this change to your contract.
              </p>
            </div>
            <div className="space-y-2 max-w-sm">
              <Label htmlFor="co-signer-name">Your full name</Label>
              <Input id="co-signer-name" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Jane Smith" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => signerName.trim() && signMut.mutate()}
                disabled={!signerName.trim() || signMut.isPending}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                {signMut.isPending ? "Submitting…" : "Approve & sign"}
              </Button>
              <Button variant="outline" onClick={() => setDeclining(true)} disabled={signMut.isPending}>
                Decline
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 border-t border-border pt-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Decline this change order</h2>
              <p className="text-sm text-muted-foreground mt-1">Let us know why (optional).</p>
            </div>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Anything we should know?" className="max-w-sm" />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeclining(false)} disabled={declineMut.isPending}>
                Back
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => declineMut.mutate()}
                disabled={declineMut.isPending}
              >
                {declineMut.isPending ? "Sending…" : "Confirm decline"}
              </Button>
            </div>
          </div>
        )}

        {!isDecided && <p className="text-xs text-muted-subtle text-center">Status: {co.status === "sent" ? "Awaiting your review" : co.status}</p>}
      </div>

      <Dialog open={!!lightboxUrl} onOpenChange={(open) => !open && setLightboxUrl(null)}>
        <DialogContent className="max-w-lg gap-3 p-4">
          <DialogTitle className="text-sm font-bold text-foreground">Photo</DialogTitle>
          {lightboxUrl && <img src={lightboxUrl} alt="" className="max-h-[70vh] w-full rounded-xl object-contain" />}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function SectionBlock({
  section,
  signedUrls,
  onImageClick,
}: {
  section: SharedChangeOrderSection;
  signedUrls: Record<string, string>;
  onImageClick: (url: string) => void;
}) {
  const subtotal = section.items.reduce((sum, i) => sum + i.price * (i.quantity ?? 1), 0);

  return (
    <div className="space-y-3">
      {section.name && <h3 className="font-semibold text-foreground [overflow-wrap:anywhere]">{section.name}</h3>}
      <div className="divide-y divide-border/60 border-y border-border/60">
        {section.items.map((item) => {
          const qty = item.quantity == null ? 1 : Number(item.quantity);
          const unit = item.unit?.trim();
          const lineTotal = item.price * qty;
          const showMeta = qty !== 1 || !!unit || !!item.description;
          const images = item.images ?? [];
          return (
            <div key={item.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground [overflow-wrap:anywhere]">{item.name || "—"}</p>
                {showMeta && (
                  <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {(qty !== 1 || unit) && `${qty}${unit ? ` ${unit}` : ""} × ${formatCurrency(item.price)}`}
                    {(qty !== 1 || unit) && item.description && " · "}
                    {item.description}
                  </p>
                )}
                {images.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {images.map((img) =>
                      signedUrls[img.storage_path] ? (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => onImageClick(signedUrls[img.storage_path])}
                          className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted"
                          aria-label="View photo"
                        >
                          <img src={signedUrls[img.storage_path]} alt="" className="h-full w-full object-cover" />
                        </button>
                      ) : (
                        <div key={img.id} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-subtle" />
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
              <span className={cn("shrink-0 text-sm font-medium tabular-nums", lineTotal < 0 ? "text-destructive" : "text-foreground")}>
                {lineTotal < 0 ? "−" : ""}
                {formatCurrency(Math.abs(lineTotal))}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-right text-sm font-medium text-foreground">
        Subtotal: {subtotal < 0 ? "−" : ""}
        {formatCurrency(Math.abs(subtotal))}
      </p>
    </div>
  );
}
