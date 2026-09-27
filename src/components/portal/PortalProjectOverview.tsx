import { useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronRight,
  FileText,
  ImagePlus,
  Loader2,
  MessageCircle,
  Package,
  Send,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn, pluralize } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import {
  getPortalProjectDetail,
  getPortalSignedImageUrls,
  setPortalQuoteItemSelected,
  approvePortalQuote,
  declinePortalQuote,
  approvePortalChangeOrder,
  declinePortalChangeOrder,
  getPortalMessages,
  sendPortalMessage,
  uploadPortalProjectImage,
  portalQuoteLabel,
  portalChangeOrderLabel,
  type PortalQuote,
  type PortalChangeOrder,
} from "@/lib/portalApi";
import { portalProjectPhase, portalProgressLabel, PORTAL_PHASE_LABEL } from "@/lib/portalStatus";
import { PortalPhotoGrid } from "./PortalPhotoGrid";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateStr = (iso: string | null) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

export function PortalProjectOverview() {
  const { id = "" } = useParams();
  const { data: detail, isLoading } = useQuery({
    queryKey: ["portal-project", id],
    queryFn: () => getPortalProjectDetail(id),
  });

  // Held as an id, not the quote/change-order object itself — the object
  // has to come fresh from `detail` on every render (below), or toggling an
  // optional item's checkbox would keep showing its pre-toggle state: the
  // mutation's onSuccess correctly invalidates and refetches `detail`, but a
  // snapshot captured once in state when the dialog opened would never see
  // that refetch.
  const [approvingQuoteId, setApprovingQuoteId] = useState<string | null>(null);
  const [approvingCOId, setApprovingCOId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-subtle" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        That project isn't linked to your account.
      </div>
    );
  }

  const approvingQuote = approvingQuoteId ? (detail.quotes.find((q) => q.id === approvingQuoteId) ?? null) : null;
  const approvingCO = approvingCOId ? (detail.change_orders.find((c) => c.id === approvingCOId) ?? null) : null;

  const phase = portalProjectPhase(detail.project);
  const progress = portalProgressLabel(detail.project);
  const pendingQuotes = detail.quotes.filter((q) => q.status === "sent");
  const pendingChangeOrders = detail.change_orders.filter((c) => c.status === "sent");
  // The job's scope comes from the original quote; add-ons are extra work.
  const approvedQuote = detail.quotes.find((q) => q.status === "approved" && q.kind !== "addon") ?? null;
  const documents = [
    ...detail.quotes
      .filter((q) => q.status !== "sent")
      .map((q) => ({ kind: "quote" as const, id: q.id, label: portalQuoteLabel(q), status: q.status, date: null as string | null })),
    ...detail.change_orders
      .filter((c) => c.status !== "sent")
      .map((c) => ({ kind: "change-order" as const, id: c.id, label: `${portalChangeOrderLabel(c)} · ${c.title}`, status: c.status, date: c.created_at })),
    ...detail.invoices.map((inv) => ({
      kind: "invoice" as const,
      id: inv.id,
      label: inv.invoice_number ?? "Invoice",
      status: inv.status !== "paid" && Number(inv.amount_paid ?? 0) > 0 ? "partial" : inv.status,
      date: inv.created_at,
    })),
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="card-surface p-5">
        <div className="flex items-center gap-3">
          {detail.business.logo_url && <BusinessLogo path={detail.business.logo_url} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold uppercase tracking-wider text-muted-subtle">
              {detail.business.company_name ?? "Your contractor"}
            </p>
            <h1 className="truncate text-xl font-bold text-foreground">{detail.project.name}</h1>
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            {PORTAL_PHASE_LABEL[phase]}
          </span>
        </div>
      </div>

      {/* Pending approvals — prominent, top of page */}
      {(pendingQuotes.length > 0 || pendingChangeOrders.length > 0) && (
        <div className="space-y-3">
          {pendingQuotes.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setApprovingQuoteId(q.id)}
              className="flex w-full items-center gap-3 rounded-card border-2 border-primary bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-foreground">
                  {q.kind === "addon" ? `${portalQuoteLabel(q)} — new work — is waiting for your review` : "A quote is waiting for your review"}
                </span>
                <span className="block text-xs text-muted-foreground">Tap to review and approve</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
            </button>
          ))}
          {pendingChangeOrders.map((co) => (
            <button
              key={co.id}
              type="button"
              onClick={() => setApprovingCOId(co.id)}
              className="flex w-full items-center gap-3 rounded-card border-2 border-primary bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-foreground">Change order: {co.title}</span>
                <span className="block text-xs text-muted-foreground">Tap to review and approve</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
            </button>
          ))}
        </div>
      )}

      {/* Schedule */}
      {(detail.project.scheduled_start_date || detail.project.scheduled_end_date) && (
        <div className="card-surface p-5">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Calendar className="h-4 w-4 text-muted-subtle" />
            Schedule
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {dateStr(detail.project.scheduled_start_date) ?? "TBD"} – {dateStr(detail.project.scheduled_end_date) ?? "TBD"}
          </p>
          {progress && <p className="mt-1 text-sm font-semibold text-foreground">{progress}</p>}
        </div>
      )}

      {/* Scope summary — from the approved quote only */}
      {approvedQuote && (
        <div className="card-surface p-5">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Package className="h-4 w-4 text-muted-subtle" />
            What we're building
          </h3>
          <div className="mt-2 space-y-3">
            {approvedQuote.sections.map((s) => (
              <div key={s.id}>
                <p className="text-sm font-bold text-foreground">{s.name}</p>
                <ul className="mt-1 space-y-1">
                  {s.items
                    .filter((i) => !(s.is_optional || i.is_optional) || i.client_selected)
                    .map((i) => (
                      <li key={i.id} className="text-sm text-muted-foreground">
                        {i.name}
                        {i.description && <span className="text-muted-subtle"> — {i.description}</span>}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photos */}
      <div className="card-surface p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">Photos</h3>
          <PortalPhotoUploadButton projectId={id} />
        </div>
        {detail.photos.length > 0 ? (
          <div className="mt-3">
            <PortalPhotoGrid photos={detail.photos} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No photos shared yet. Snap a site condition or question and send it to your contractor.
          </p>
        )}
      </div>

      {/* Messages */}
      <PortalMessagesCard projectId={id} />

      {/* Deliveries */}
      {detail.deliveries.length > 0 && (
        <div className="card-surface p-5">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Truck className="h-4 w-4 text-muted-subtle" />
            Deliveries
          </h3>
          <div className="mt-3 space-y-3">
            {detail.deliveries.map((d) => (
              <div key={d.id} className="border-t border-hairline pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{d.supplier ?? "Supplier TBD"}</p>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {d.status === "delivered" ? "Delivered" : d.status === "delayed" ? "Delayed" : "On the way"}
                  </span>
                </div>
                {d.expected_delivery_date && (
                  <p className="text-xs text-muted-subtle">Expected {dateStr(d.expected_delivery_date)}</p>
                )}
                {d.photos.length > 0 && (
                  <div className="mt-2">
                    <PortalPhotoGrid photos={d.photos} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payments (0111) — paid to date, remaining, receipts */}
      {detail.money && (detail.money.contract_value > 0 || detail.money.received > 0) && (
        <div className="card-surface p-5">
          <h3 className="text-base font-bold text-foreground">Payments</h3>
          <div className="mt-2 divide-y divide-hairline text-sm">
            {detail.money.contract_value > 0 && (
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">Project total</span>
                <span className="font-semibold tabular-nums text-foreground">{money(detail.money.contract_value)}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">Paid to date</span>
              <span className="font-semibold tabular-nums text-foreground">{money(detail.money.received)}</span>
            </div>
            {detail.money.contract_value > 0 && (
              <div className="flex items-center justify-between py-2">
                <span className="font-semibold text-foreground">
                  {detail.money.received > detail.money.contract_value ? "Credit balance" : "Remaining balance"}
                </span>
                <span className="font-bold tabular-nums text-foreground">
                  {money(Math.abs(detail.money.contract_value - detail.money.received))}
                </span>
              </div>
            )}
          </div>
          {detail.money.receipts.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Receipts</p>
              <div className="mt-1 divide-y divide-hairline">
                {detail.money.receipts.map((r) => (
                  <a
                    key={r.token}
                    href={`/receipt/${r.token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {r.number ?? "Receipt"} <span className="font-normal text-muted-foreground">· {dateStr(r.paid_on)}</span>
                    </span>
                    <span className="flex items-center gap-2 text-sm font-semibold tabular-nums text-foreground">
                      {money(Number(r.amount))}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-subtle" />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <div className="card-surface p-5">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <FileText className="h-4 w-4 text-muted-subtle" />
            Documents
          </h3>
          <div className="mt-2 divide-y divide-hairline">
            {documents.map((doc) => (
              <Link
                key={`${doc.kind}-${doc.id}`}
                to={`/portal/projects/${id}/documents/${doc.kind}/${doc.id}`}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="text-sm font-semibold text-foreground">{doc.label}</span>
                <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  {statusLabel(doc.status)}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-subtle" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Activity */}
      {detail.events.length > 0 && (
        <div className="card-surface p-5">
          <h3 className="text-base font-bold text-foreground">Activity</h3>
          <div className="mt-2 space-y-2.5">
            {detail.events.map((e) => (
              <div key={e.id} className="text-sm">
                <p className="text-foreground">{e.summary}</p>
                <p className="text-xs text-muted-subtle">{dateStr(e.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {approvingQuote && (
        <QuoteApprovalDialog
          quote={approvingQuote}
          projectId={id}
          onClose={() => setApprovingQuoteId(null)}
        />
      )}
      {approvingCO && (
        <ChangeOrderApprovalDialog changeOrder={approvingCO} projectId={id} onClose={() => setApprovingCOId(null)} />
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "declined":
      return "Declined";
    case "paid":
      return "Paid";
    case "partial":
      return "Partially paid";
    case "overdue":
      return "Overdue";
    case "sent":
      return "Sent";
    default:
      return status;
  }
}

/** Phase 5 — a client-submitted photo lands in the SAME project_images
 * table the contractor's own gallery reads, hidden until they accept it
 * (see uploadPortalProjectImage's doc comment) — so there's nothing to add
 * to this page's own photo grid on success, just a confirmation toast. */
function PortalPhotoUploadButton({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadPortalProjectImage(projectId, file, ""),
    onSuccess: () => toast({ title: "Photo sent to your contractor" }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMut.isPending}
        className="flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploadMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        Add photo
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) uploadMut.mutate(file);
        }}
      />
    </>
  );
}

/** Phase 5 — the client's side of the per-project message thread. The
 * contractor's side lives on the project page (ProjectMessagesCard in
 * ProjectDetailView.tsx) and in the existing Communications log — not a
 * second inbox, just this same thread from the other party's view. */
function PortalMessagesCard({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["portal-messages", projectId],
    queryFn: () => getPortalMessages(projectId),
  });

  const allPaths = messages.flatMap((m) => m.image_paths);
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["portal-messages-urls", projectId, allPaths],
    queryFn: () => getPortalSignedImageUrls(allPaths),
    enabled: allPaths.length > 0,
  });

  const sendMut = useMutation({
    mutationFn: () => sendPortalMessage(projectId, body, files),
    onSuccess: () => {
      setBody("");
      setFiles([]);
      qc.invalidateQueries({ queryKey: ["portal-messages", projectId] });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const canSend = (body.trim().length > 0 || files.length > 0) && !sendMut.isPending;

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
          <MessageCircle className="h-4 w-4 text-muted-subtle" />
          Messages
        </h3>
        {messages.length > 0 && (
          <span className="text-[13px] font-semibold text-muted-foreground">
            {pluralize(messages.length, "message")}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Questions about the project? Send a message to your contractor below.
        </p>
      ) : (
        <ul className="mt-3 max-h-96 space-y-3 overflow-y-auto">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2",
                m.sender === "client" ? "ml-auto bg-primary/10" : "bg-muted",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">
                  {m.sender === "client" ? "You" : "Contractor"}
                </span>
                <span className="text-[11px] text-muted-subtle">{timeAgo(m.created_at)}</span>
              </div>
              {m.body && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-foreground/80">{m.body}</p>}
              {m.image_paths.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {m.image_paths.map((path) =>
                    signedUrls[path] ? (
                      <img key={path} src={signedUrls[path]} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    ) : (
                      <div key={path} className="flex h-16 w-16 items-center justify-center rounded-lg bg-black/10">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-subtle" />
                      </div>
                    ),
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {f.name}
              <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Remove photo">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          rows={2}
          className="min-h-0 flex-1 resize-none"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-border text-muted-subtle transition-colors hover:border-primary hover:text-primary"
          aria-label="Attach photos"
        >
          <ImagePlus className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (picked.length) setFiles((prev) => [...prev, ...picked]);
          }}
        />
        <Button type="button" size="icon" onClick={() => sendMut.mutate()} disabled={!canSend} aria-label="Send message" className="shrink-0">
          {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function BusinessLogo({ path }: { path: string }) {
  const { data: urls } = useQuery({
    queryKey: ["portal-logo-url", path],
    queryFn: () => getPortalSignedImageUrls([path]),
    staleTime: 30 * 60 * 1000,
  });
  const url = urls?.[path];
  if (!url) return null;
  return <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />;
}

function QuoteApprovalDialog({
  quote,
  projectId,
  onClose,
}: {
  quote: PortalQuote;
  projectId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [signedBy, setSignedBy] = useState("");
  const [declining, setDeclining] = useState(false);
  const [comment, setComment] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["portal-project", projectId] });

  const toggleMut = useMutation({
    mutationFn: ({ itemId, selected }: { itemId: string; selected: boolean }) =>
      setPortalQuoteItemSelected(itemId, selected),
    onSuccess: invalidate,
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const approveMut = useMutation({
    mutationFn: () => approvePortalQuote(quote.id, signedBy),
    onSuccess: () => {
      invalidate();
      toast({ title: "Quote approved" });
      onClose();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const declineMut = useMutation({
    mutationFn: () => declinePortalQuote(quote.id, comment),
    onSuccess: () => {
      invalidate();
      toast({ title: "Quote declined" });
      onClose();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const total = quote.sections.reduce(
    (sum, s) =>
      sum + s.items.reduce((a, i) => a + (!(s.is_optional || i.is_optional) || i.client_selected ? i.price * i.quantity : 0), 0),
    0,
  );
  const deposit = (total * quote.deposit_percentage) / 100;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review quote</DialogTitle>
        </DialogHeader>

        {!declining ? (
          <>
            <div className="space-y-4">
              {quote.sections.map((section) => (
                <div key={section.id}>
                  <p className="text-sm font-bold text-foreground">{section.name}</p>
                  <div className="mt-1.5 space-y-2">
                    {section.items.map((item) => {
                      const optional = section.is_optional || item.is_optional;
                      return (
                        <div key={item.id} className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            {optional && (
                              <Checkbox
                                checked={item.client_selected}
                                disabled={toggleMut.isPending}
                                onCheckedChange={(checked) =>
                                  toggleMut.mutate({ itemId: item.id, selected: checked === true })
                                }
                                className="mt-0.5"
                              />
                            )}
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {item.name}
                                {optional && (
                                  <span className="ml-1.5 text-[11px] font-semibold text-muted-subtle">Optional</span>
                                )}
                              </p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground">{item.description}</p>
                              )}
                            </div>
                          </div>
                          <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                            {money(item.price * item.quantity)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 border-t border-hairline pt-3">
              <div className="flex items-center justify-between text-base font-extrabold text-foreground">
                <span>Total</span>
                <span className="tabular-nums">{money(total)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Deposit due ({quote.deposit_percentage}%)</span>
                <span className="tabular-nums">{money(deposit)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="portal-sign-name" className="text-xs font-semibold text-muted-foreground">
                Type your name to sign
              </Label>
              <Input
                id="portal-sign-name"
                value={signedBy}
                onChange={(e) => setSignedBy(e.target.value)}
                placeholder="Full name"
                className="h-11"
              />
            </div>

            <div className="flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeclining(true)}
                disabled={approveMut.isPending}
              >
                Decline
              </Button>
              <Button
                className="flex-1 font-bold"
                disabled={!signedBy.trim() || approveMut.isPending}
                onClick={() => approveMut.mutate()}
              >
                <Check className="h-4 w-4" />
                {approveMut.isPending ? "Approving…" : "Approve"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="portal-decline-comment" className="text-xs font-semibold text-muted-foreground">
                Let us know why (optional)
              </Label>
              <Textarea
                id="portal-decline-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Anything we should know?"
              />
            </div>
            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={() => setDeclining(false)}>
                Back
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={declineMut.isPending}
                onClick={() => declineMut.mutate()}
              >
                {declineMut.isPending ? "Sending…" : "Confirm decline"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChangeOrderApprovalDialog({
  changeOrder,
  projectId,
  onClose,
}: {
  changeOrder: PortalChangeOrder;
  projectId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [signedBy, setSignedBy] = useState("");
  const [declining, setDeclining] = useState(false);
  const [comment, setComment] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["portal-project", projectId] });

  const approveMut = useMutation({
    mutationFn: () => approvePortalChangeOrder(changeOrder.id, signedBy),
    onSuccess: () => {
      invalidate();
      toast({ title: "Change order approved" });
      onClose();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const declineMut = useMutation({
    mutationFn: () => declinePortalChangeOrder(changeOrder.id, comment),
    onSuccess: () => {
      invalidate();
      toast({ title: "Change order declined" });
      onClose();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle>Review change order</DialogTitle>
        </DialogHeader>

        {!declining ? (
          <>
            <div>
              <p className="text-base font-bold text-foreground">{changeOrder.title}</p>
              {changeOrder.description && (
                <p className="mt-1 text-sm text-muted-foreground">{changeOrder.description}</p>
              )}
            </div>

            {changeOrder.sections.length > 0 && (
              <div className="space-y-3">
                {changeOrder.sections.map((section) => (
                  <div key={section.id}>
                    {section.name && <p className="text-sm font-bold text-foreground">{section.name}</p>}
                    <div className="mt-1.5 space-y-2">
                      {section.items.map((item) => {
                        const lineTotal = item.price * (item.quantity ?? 1);
                        return (
                          <div key={item.id} className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{item.name}</p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground">{item.description}</p>
                              )}
                            </div>
                            <p
                              className={cn(
                                "shrink-0 text-sm font-bold tabular-nums",
                                lineTotal < 0 ? "text-destructive" : "text-foreground",
                              )}
                            >
                              {lineTotal >= 0 ? "+" : "−"}
                              {money(Math.abs(lineTotal))}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-base font-extrabold text-foreground">
              <span>Change to your contract</span>
              <span className="tabular-nums">
                {changeOrder.amount >= 0 ? "+" : "−"}
                {money(Math.abs(changeOrder.amount))}
              </span>
            </div>

            {!!changeOrder.schedule_impact_days && (
              <p className="text-sm text-muted-foreground">
                Schedule impact:{" "}
                <span className="font-semibold text-foreground">
                  {changeOrder.schedule_impact_days > 0
                    ? `Adds ${changeOrder.schedule_impact_days} working day${changeOrder.schedule_impact_days === 1 ? "" : "s"}`
                    : `Saves ${Math.abs(changeOrder.schedule_impact_days)} working day${Math.abs(changeOrder.schedule_impact_days) === 1 ? "" : "s"}`}
                </span>
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="co-sign-name" className="text-xs font-semibold text-muted-foreground">
                Type your name to sign
              </Label>
              <Input
                id="co-sign-name"
                value={signedBy}
                onChange={(e) => setSignedBy(e.target.value)}
                placeholder="Full name"
                className="h-11"
              />
            </div>

            <div className="flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeclining(true)}
                disabled={approveMut.isPending}
              >
                Decline
              </Button>
              <Button
                className="flex-1 font-bold"
                disabled={!signedBy.trim() || approveMut.isPending}
                onClick={() => approveMut.mutate()}
              >
                <Check className="h-4 w-4" />
                {approveMut.isPending ? "Approving…" : "Approve"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="co-decline-comment" className="text-xs font-semibold text-muted-foreground">
                Let us know why (optional)
              </Label>
              <Textarea
                id="co-decline-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Anything we should know?"
              />
            </div>
            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={() => setDeclining(false)}>
                Back
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={declineMut.isPending}
                onClick={() => declineMut.mutate()}
              >
                {declineMut.isPending ? "Sending…" : "Confirm decline"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
