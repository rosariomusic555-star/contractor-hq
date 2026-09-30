import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, Circle, ExternalLink, MessageCircle, Minus, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMinWidth } from "@/hooks/use-hub-layout";
import { cn } from "@/lib/utils";
import {
  approvePortalChangeOrder,
  approvePortalQuote,
  declinePortalChangeOrder,
  declinePortalQuote,
  portalChangeOrderLabel,
  portalQuoteLabel,
  setPortalQuoteItemSelected,
  setPortalSelection,
  type PortalChangeOrder,
  type PortalInvoice,
  type PortalProjectDetail,
  type PortalQuote,
  type PortalQuoteSection,
  type PortalSelectionGroup,
} from "@/lib/portalApi";
import { clientGroupLike, missingRequired, priceLabel, sectionIncluded } from "@/lib/selections";
import { depositAmount, invoiceBalance, paymentMethodLabel } from "@/lib/projectMoney";
import { clientProjectMoney } from "@/lib/projectHistory";
import { effectiveInvoiceStatus } from "@/lib/financials";
import { quoteBreakdown, type HubTone } from "@/lib/hubDesktop";
import { ClientSelectionGroups } from "@/components/selections/ClientSelectionGroups";
import { RequestSelectionChangeDialog } from "@/components/selections/RequestSelectionChangeDialog";
import { HubLogo, MoneyLine, TonePill } from "./HubPrimitives";
import { HOW_TO_PAY, focusRing, hubDate, hubMoney, type SignUrls } from "./hubUtils";
import { ContactDetails } from "./HubSideCards";

type Mode = "portal" | "preview";
type TrackEvent = (kind: "pdf_downloaded" | "optional_changed", detail?: Record<string, unknown>) => void;

export interface HubDocumentDesktopProps {
  mode: Mode;
  kind: "quote" | "change-order" | "invoice";
  detail: PortalProjectDetail;
  projectId: string;
  projectBase: string;
  /** The version shown (a snapshot when looking at an older one). */
  doc: PortalQuote | PortalChangeOrder | PortalInvoice;
  /** The live document (current state). */
  live: PortalQuote | PortalChangeOrder | PortalInvoice;
  /** Set when an older, superseded version is shown. */
  olderVersion: { version: number; latest: number; sentOn: string | null; currentPath: string } | null;
  version: number | null;
  versionStrip: ReactNode;
  /** The classic document body (change orders / invoices reuse it as-is). */
  body?: ReactNode;
  signUrls: SignUrls;
  trackEvent: TrackEvent;
  twoColumnMin: number;
}

/**
 * Desktop Client Hub document page (the default on md and up): the
 * document reads like a proposal on the left — letterhead, prepared-for,
 * the content — with a sticky action panel on the right (total, what's
 * chosen, sign / approve / decline, how to pay). Below `twoColumnMin` the
 * panel follows the document. The panel never prints.
 */
export function HubDocumentDesktop(props: HubDocumentDesktopProps) {
  const { kind, detail, doc, olderVersion, versionStrip, projectBase, twoColumnMin } = props;
  const twoCol = useMinWidth(twoColumnMin);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const location = useLocation();
  useEffect(() => {
    if (location.hash === "#pay") document.getElementById("pay")?.scrollIntoView({ block: "center" });
  }, [location.hash]);

  const title =
    kind === "quote"
      ? portalQuoteLabel(doc as PortalQuote)
      : kind === "change-order"
        ? portalChangeOrderLabel(doc as PortalChangeOrder)
        : `Invoice ${(doc as PortalInvoice).invoice_number ?? ""}`.trim();
  const status = docStatus(props);

  const panel =
    kind === "quote" ? (
      <QuotePanel {...props} picks={picks} />
    ) : kind === "change-order" ? (
      <ChangeOrderPanel {...props} />
    ) : (
      <InvoicePanel {...props} />
    );

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to={projectBase} className={cn("inline-flex items-center rounded text-sm font-semibold text-muted-foreground hover:text-foreground", focusRing)}>
          ← Back to project
        </Link>
        {versionStrip}
      </div>

      <div className={cn("items-start gap-6", twoCol ? "grid grid-cols-[minmax(0,1fr)_minmax(300px,360px)]" : "space-y-5")}>
        <article className="card-surface min-w-0 space-y-6 p-6 lg:p-10 print:border-0 print:p-0 print:shadow-none">
          {olderVersion && (
            <div className="no-print rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <span className="font-bold text-foreground">
                Version {olderVersion.version} — superseded by v{olderVersion.latest}.
              </span>{" "}
              <span className="text-muted-foreground">
                This is exactly what was sent{olderVersion.sentOn ? ` on ${olderVersion.sentOn}` : ""}.{" "}
                <Link to={olderVersion.currentPath} className="font-semibold text-primary hover:underline">
                  See the current version
                </Link>
              </span>
            </div>
          )}
          <Letterhead detail={detail} signUrls={props.signUrls} title={title} version={props.version} date={docDate(props)} status={status} />
          {kind === "quote" ? <QuoteBody {...props} picks={picks} setPicks={setPicks} /> : props.body}
        </article>
        <aside className={cn("no-print space-y-5", twoCol && "sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto overscroll-contain pb-1")} aria-label="Summary and actions">
          {panel}
        </aside>
      </div>
    </div>
  );
}

function docDate({ kind, doc }: HubDocumentDesktopProps) {
  return hubDate((doc as { created_at?: string }).created_at ?? null, true);
}

function docStatus({ kind, doc, live, olderVersion }: HubDocumentDesktopProps): { label: string; tone: HubTone } {
  if (olderVersion) return { label: "Superseded", tone: "gray" };
  if (kind === "invoice") {
    const inv = live as PortalInvoice;
    const like = { ...inv, status: inv.status as "sent" };
    if (inv.status === "paid" || invoiceBalance(like) <= 0.004) return { label: "Paid", tone: "green" };
    if (effectiveInvoiceStatus(like) === "overdue") return { label: "Overdue", tone: "red" };
    return { label: Number(inv.amount_paid ?? 0) > 0.004 ? "Partially paid" : "Due", tone: "amber" };
  }
  const s = (live as PortalQuote | PortalChangeOrder).status;
  if (s === "approved") return { label: kind === "quote" ? "Signed" : "Approved", tone: "green" };
  if (s === "declined") return { label: "Declined", tone: "gray" };
  return { label: kind === "quote" ? "Awaiting your signature" : "Awaiting your approval", tone: "amber" };
}

function Letterhead({
  detail,
  signUrls,
  title,
  version,
  date,
  status,
}: {
  detail: PortalProjectDetail;
  signUrls: SignUrls;
  title: string;
  version: number | null;
  date: string | null;
  status: { label: string; tone: HubTone };
}) {
  const b = detail.business;
  return (
    <header className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-hairline pb-6">
        <div className="flex min-w-0 items-start gap-4">
          <HubLogo path={b.logo_url} signUrls={signUrls} className="h-14 w-14" />
          <div className="min-w-0 text-sm text-muted-foreground">
            <p className="text-lg font-bold text-foreground">{b.company_name ?? "Your contractor"}</p>
            {b.address && <p>{b.address}</p>}
            <p>{[b.phone, b.email].filter(Boolean).join(" · ")}</p>
            {b.license && <p className="text-xs text-muted-subtle">License {b.license}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tracking-tight text-foreground">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{[version ? `Version ${version}` : null, date].filter(Boolean).join(" · ")}</p>
          <TonePill tone={status.tone} className="mt-2">
            {status.label}
          </TonePill>
        </div>
      </div>
      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Prepared for</p>
          <p className="mt-0.5 font-semibold text-foreground">{detail.client?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Project</p>
          <p className="mt-0.5 font-semibold text-foreground">{detail.project.name}</p>
          {detail.project.address && <p className="text-muted-foreground">{detail.project.address}</p>}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

/** Signing / choosing is open only on the current version of a sent quote,
 * in the client's own Hub. */
const quoteEditable = (p: HubDocumentDesktopProps) => p.mode === "portal" && !p.olderVersion && (p.live as PortalQuote).status === "sent";

function useQuoteImages(quote: PortalQuote, signUrls: SignUrls) {
  const paths = quote.sections.flatMap((s) => [
    ...s.items.flatMap((i) => (i.images ?? []).map((im) => im.storage_path)),
    ...(s.selections ?? []).flatMap((g) => g.options.map((o) => o.image_path).filter(Boolean) as string[]),
  ]);
  const { data = {} } = useQuery({
    queryKey: ["hub-quote-images", paths.join(",")],
    queryFn: () => signUrls(paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
  });
  return data;
}

function QuoteBody(props: HubDocumentDesktopProps & { picks: Record<string, string[]>; setPicks: React.Dispatch<React.SetStateAction<Record<string, string[]>>> }) {
  const { projectId, signUrls, trackEvent, picks, setPicks } = props;
  const quote = props.doc as PortalQuote;
  const live = props.live as PortalQuote;
  const editable = quoteEditable(props);
  const approvedNow = !props.olderVersion && live.status === "approved";
  const canRequestChange = props.mode === "portal" && approvedNow;
  const { toast } = useToast();
  const qc = useQueryClient();
  const urls = useQuoteImages(quote, signUrls);
  const [zoom, setZoom] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<PortalSelectionGroup | null>(null);

  const pickMut = useMutation({
    mutationFn: ({ groupId, ids }: { groupId: string; ids: string[] }) => setPortalSelection(groupId, ids),
    onError: (err: Error) => toast({ title: "Couldn't save your choice", description: err.message, variant: "destructive" }),
  });
  const choose = (groupId: string, ids: string[]) => {
    setPicks((p) => ({ ...p, [groupId]: ids }));
    pickMut.mutate({ groupId, ids });
  };
  const toggleMut = useMutation({
    mutationFn: async ({ itemIds, selected }: { itemIds: string[]; selected: boolean; label: string }) => {
      await Promise.all(itemIds.map((id) => setPortalQuoteItemSelected(id, selected)));
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["portal-project", projectId] });
      trackEvent("optional_changed", { summary: `${v.selected ? "Added" : "Dropped"} ${v.label}`, selected: v.selected });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const missing = missingRequired(
    quote.sections.filter((s) => sectionIncluded(s)).flatMap((s) => (s.selections ?? []).map(clientGroupLike)),
    picks,
  );

  return (
    <div className="space-y-8">
      {quote.sections.map((section) => (
        <QuoteSectionBlock
          key={section.id}
          section={section}
          editable={editable}
          busy={toggleMut.isPending}
          urls={urls}
          onZoom={setZoom}
          onToggle={(itemIds, selected, label) => toggleMut.mutate({ itemIds, selected, label })}
          selections={
            (section.selections ?? []).length > 0 &&
            (sectionIncluded(section) ? (
              <ClientSelectionGroups
                groups={section.selections!}
                picks={picks}
                onChange={editable ? choose : undefined}
                imageUrls={urls}
                locked={approvedNow}
                flagMissing={editable && missing.length > 0}
                footer={
                  canRequestChange
                    ? (g) => (
                        <button type="button" onClick={() => setRequesting(g)} className={cn("no-print mt-2 rounded text-xs font-semibold text-primary hover:underline", focusRing)}>
                          Request a change
                        </button>
                      )
                    : undefined
                }
              />
            ) : (
              <p className="text-sm text-muted-subtle">Choices for this optional section appear once you add it.</p>
            ))
          }
        />
      ))}

      {quote.notes && (
        <div className="border-t border-hairline pt-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-subtle">Notes</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{quote.notes}</p>
        </div>
      )}
      {quote.terms && (
        <div className="border-t border-hairline pt-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-subtle">Terms</h3>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{quote.terms}</p>
        </div>
      )}
      {/* Print-only total (the panel doesn't print). */}
      <div className="hidden border-t border-hairline pt-4 print:block">
        <MoneyLine label="Total" value={hubMoney(quoteBreakdown(quote.sections, picks).total)} strong />
      </div>
      {(quote.status === "approved" || live.status === "approved") && !props.olderVersion && live.signed_at && (
        <p className="text-sm text-muted-foreground">
          Signed by <span className="font-semibold text-foreground">{live.signed_by ?? "client"}</span> on {hubDate(live.signed_at, true)}
        </p>
      )}

      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">Photo</DialogTitle>
          {zoom && <img src={zoom} alt="" className="max-h-[85vh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
      <RequestSelectionChangeDialog group={requesting} onClose={() => setRequesting(null)} />
    </div>
  );
}

function QuoteSectionBlock({
  section,
  editable,
  busy,
  urls,
  onZoom,
  onToggle,
  selections,
}: {
  section: PortalQuoteSection;
  editable: boolean;
  busy: boolean;
  urls: Record<string, string>;
  onZoom: (url: string) => void;
  onToggle: (itemIds: string[], selected: boolean, label: string) => void;
  selections: ReactNode;
}) {
  const included = sectionIncluded(section);
  const subtotal = section.items
    .filter((i) => !(section.is_optional || i.is_optional) || i.client_selected)
    .reduce((s, i) => s + Number(i.price) * Number(i.quantity ?? 1), 0);
  return (
    <section data-track-section={section.name} className={cn("space-y-3", section.is_optional && "rounded-2xl border border-dashed border-border p-5", section.is_optional && included && "border-solid border-primary/40 bg-primary/[0.03]")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-2">
        <h3 className="flex items-center gap-2 text-base font-bold uppercase tracking-wide text-foreground">
          {section.name}
          {section.is_optional && <TonePill tone={included ? "green" : "gray"}>{included ? "Optional · added" : "Optional"}</TonePill>}
        </h3>
        <div className="flex items-center gap-3">
          {section.is_optional && editable && (
            <Button
              size="sm"
              variant={included ? "outline" : "default"}
              disabled={busy}
              onClick={() => onToggle(section.items.map((i) => i.id), !included, `optional section ${section.name}`)}
              className="h-9 font-semibold"
            >
              {included ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {included ? "Remove" : "Add to project"}
            </Button>
          )}
          {subtotal > 0 && <span className="text-sm font-bold tabular-nums text-foreground">{hubMoney(subtotal)}</span>}
        </div>
      </div>
      <div className="divide-y divide-hairline">
        {section.items.map((item) => {
          const optional = section.is_optional || item.is_optional;
          const notChosen = optional && !item.client_selected;
          const q = Number(item.quantity ?? 1);
          return (
            <div key={item.id} className="flex items-start justify-between gap-4 py-3">
              <div className={cn("min-w-0", notChosen && "opacity-60")}>
                <p className="text-sm font-semibold text-foreground">{item.name}</p>
                {item.description && <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>}
                {q !== 1 && Number.isFinite(q) && (
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {q} {item.unit ? `${item.unit} ` : ""}× {hubMoney(Number(item.price))}
                  </p>
                )}
                {(item.images ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.images!.map((im) =>
                      urls[im.storage_path] ? (
                        <button key={im.id} type="button" onClick={() => onZoom(urls[im.storage_path])} className={cn("h-20 w-20 overflow-hidden rounded-lg bg-muted", focusRing)} aria-label={`Enlarge photo of ${item.name}`}>
                          <img src={urls[im.storage_path]} alt="" className="h-full w-full object-cover" />
                        </button>
                      ) : null,
                    )}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className={cn("text-sm font-bold tabular-nums text-foreground", notChosen && "font-semibold text-muted-foreground line-through")}>
                  {hubMoney(Number(item.price) * q)}
                </p>
                {item.is_optional && !section.is_optional && (
                  editable ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onToggle([item.id], !item.client_selected, item.name)}
                      className={cn("mt-1 rounded text-xs font-semibold text-primary hover:underline disabled:opacity-50", focusRing)}
                    >
                      {item.client_selected ? "Remove" : "+ Add"}
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground">{item.client_selected ? "Optional · added" : "Optional · not included"}</p>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
      {selections && <div className="pt-1">{selections}</div>}
    </section>
  );
}

function PanelCard({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={cn("card-surface scroll-mt-6 p-5", className)}>{children}</section>;
}

function PdfButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" className="h-10 w-full font-semibold" onClick={onClick}>
      <Printer className="h-4 w-4" /> Download PDF
    </Button>
  );
}

function QuotePanel(props: HubDocumentDesktopProps & { picks: Record<string, string[]> }) {
  const { picks, projectId, trackEvent, mode } = props;
  const quote = props.doc as PortalQuote;
  const live = props.live as PortalQuote;
  const editable = quoteEditable(props);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState<"summary" | "review" | "decline">("summary");
  const [signedBy, setSignedBy] = useState("");
  const [comment, setComment] = useState("");

  const groups = quote.sections.filter((s) => sectionIncluded(s)).flatMap((s) => (s.selections ?? []).map((g) => ({ g, section: s })));
  const missing = missingRequired(groups.map(({ g }) => clientGroupLike(g)), picks);
  const chosen = (g: PortalSelectionGroup) => {
    const ids = picks[g.id] ?? g.picked;
    const eff = ids.length ? ids : g.options.filter((o) => o.is_default).map((o) => o.id);
    return g.options.filter((o) => eff.includes(o.id));
  };
  const b = quoteBreakdown(quote.sections, picks);
  const hasOptional = quote.sections.some((s) => s.is_optional || s.items.some((i) => i.is_optional));
  const deposit = depositAmount(b.total, quote.deposit_percentage);
  // Payments on the project already cover the deposit → say so instead of
  // asking for it again. (Add-ons: their deposit is on top of what's paid.)
  const { summary } = clientProjectMoney(props.detail);
  const depositReceived = quote.kind !== "addon" && summary.received + 0.005 >= deposit;

  const done = () => qc.invalidateQueries({ queryKey: ["portal-project", projectId] });
  const approveMut = useMutation({
    mutationFn: () => approvePortalQuote(quote.id, signedBy),
    onSuccess: () => {
      done();
      toast({ title: "Quote approved — thank you!" });
      setStep("summary");
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  const declineMut = useMutation({
    mutationFn: () => declinePortalQuote(quote.id, comment),
    onSuccess: () => {
      done();
      toast({ title: "Quote declined" });
      setStep("summary");
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const signBlock = (
    <div className="space-y-2">
      <Label htmlFor="hub-sign-name" className="text-xs font-semibold text-muted-foreground">
        Type your full name to sign
      </Label>
      <Input id="hub-sign-name" value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Full name" className="h-11" autoComplete="name" />
      <Button className="h-12 w-full text-base font-bold" disabled={!signedBy.trim() || approveMut.isPending || missing.length > 0} onClick={() => approveMut.mutate()}>
        <Check className="h-4 w-4" />
        {approveMut.isPending ? "Approving…" : "Approve & sign"}
      </Button>
    </div>
  );

  return (
    <>
      <PanelCard>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Your total</p>
        <p className="mt-0.5 text-3xl font-extrabold tracking-tight tabular-nums text-foreground" aria-live="polite">
          {hubMoney(b.total)}
        </p>
        <div className="mt-3">
          <MoneyLine label="Base scope" value={hubMoney(b.base)} />
          {hasOptional && <MoneyLine label="Optional items added" value={b.optional ? `+${hubMoney(b.optional)}` : hubMoney(0)} />}
          {groups.length > 0 && <MoneyLine label="Your selections" value={priceLabel(b.selections)} />}
          <MoneyLine label={`Deposit (${quote.deposit_percentage}%)`} value={hubMoney(deposit)} strong />
        </div>
      </PanelCard>

      {groups.length > 0 && (
        <PanelCard>
          <h2 className="text-sm font-bold text-foreground">Your selections</h2>
          <ul className="mt-2 space-y-2">
            {groups.map(({ g, section }) => {
              const names = chosen(g);
              const ok = names.length > 0;
              return (
                <li key={g.id} className="flex items-start gap-2 text-sm">
                  {ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Chosen" />
                  ) : (
                    <Circle className={cn("mt-0.5 h-4 w-4 shrink-0", g.required ? "text-warning-strong" : "text-muted-subtle")} aria-label="Not chosen" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-muted-foreground">
                      {section.name} · {g.name}
                      {g.required && !ok && <span className="font-semibold text-warning-strong"> (required)</span>}
                    </span>
                    <span className="block font-semibold text-foreground">
                      {ok ? names.map((o) => `${o.name}${o.price_delta ? ` (${priceLabel(o.price_delta)})` : ""}`).join(", ") : "Not chosen yet"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </PanelCard>
      )}

      <PanelCard className="space-y-3">
        {props.olderVersion ? (
          <p className="text-sm text-muted-foreground">
            This is an older version for your records.{" "}
            <Link to={props.olderVersion.currentPath} className="font-semibold text-primary hover:underline">
              Open the current version
            </Link>
          </p>
        ) : live.status === "approved" ? (
          <>
            <p className="flex items-center gap-2 text-sm font-bold text-success">
              <CheckCircle2 className="h-5 w-5" /> Signed by {live.signed_by ?? "you"}
              {live.signed_at ? ` on ${hubDate(live.signed_at)}` : ""}
            </p>
            {deposit > 0 &&
              (depositReceived ? (
                <p className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-sm font-semibold text-success">
                  <Check className="h-4 w-4" /> Deposit received · {hubMoney(deposit)}
                </p>
              ) : (
                <div id="pay" className="rounded-xl bg-muted/50 p-3 text-sm">
                  <p className="font-semibold text-foreground">Deposit due: {hubMoney(deposit)}</p>
                  <p className="mt-1 text-muted-foreground">{HOW_TO_PAY}</p>
                </div>
              ))}
          </>
        ) : live.status === "declined" ? (
          <p className="text-sm text-muted-foreground">You declined this quote{live.declined_at ? ` on ${hubDate(live.declined_at)}` : ""}.</p>
        ) : mode === "preview" ? (
          <>
            <Button className="h-12 w-full text-base font-bold" disabled>
              Review &amp; sign
            </Button>
            <p className="text-xs text-muted-subtle">Preview — your client reviews and signs here.</p>
          </>
        ) : step === "decline" ? (
          <>
            <Label htmlFor="hub-decline" className="text-xs font-semibold text-muted-foreground">
              Let us know why (optional)
            </Label>
            <Textarea id="hub-decline" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Anything we should know?" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("summary")}>
                Back
              </Button>
              <Button variant="outline" className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={declineMut.isPending} onClick={() => declineMut.mutate()}>
                {declineMut.isPending ? "Sending…" : "Confirm decline"}
              </Button>
            </div>
          </>
        ) : step === "review" || groups.length === 0 ? (
          <>
            {groups.length > 0 && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="font-bold text-foreground">Please review before signing</p>
                <p className="mt-1 text-muted-foreground">
                  {groups.length} selection{groups.length === 1 ? "" : "s"} · final total{" "}
                  <span className="font-bold tabular-nums text-foreground">{hubMoney(b.total)}</span>
                </p>
              </div>
            )}
            {signBlock}
            <div className="flex justify-between text-sm">
              {groups.length > 0 ? (
                <button type="button" className={cn("rounded font-semibold text-muted-foreground hover:text-foreground", focusRing)} onClick={() => setStep("summary")}>
                  ← Back
                </button>
              ) : (
                <span />
              )}
              <button type="button" className={cn("rounded font-semibold text-muted-foreground hover:text-destructive", focusRing)} onClick={() => setStep("decline")}>
                Decline
              </button>
            </div>
          </>
        ) : (
          <>
            {missing.length > 0 && (
              <p className="flex items-start gap-1.5 text-sm font-semibold text-warning-strong">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Choose {missing.map((g) => `"${g.name}"`).join(", ")} to continue.
              </p>
            )}
            <Button className="h-12 w-full text-base font-bold" disabled={missing.length > 0 || !editable} onClick={() => setStep("review")}>
              Review &amp; sign
            </Button>
            <button type="button" className={cn("w-full rounded text-center text-sm font-semibold text-muted-foreground hover:text-destructive", focusRing)} onClick={() => setStep("decline")}>
              Decline this quote
            </button>
          </>
        )}
        <PdfButton
          onClick={() => {
            trackEvent("pdf_downloaded", {});
            window.print();
          }}
        />
      </PanelCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// Change order
// ---------------------------------------------------------------------------

function useAskQuestion(projectBase: string) {
  const navigate = useNavigate();
  return (about: string) => navigate(projectBase, { state: { messageDraft: `About ${about}: ` } });
}

function ChangeOrderPanel(props: HubDocumentDesktopProps) {
  const { projectId, mode, detail, projectBase } = props;
  const co = props.live as PortalChangeOrder;
  const { toast } = useToast();
  const qc = useQueryClient();
  const ask = useAskQuestion(projectBase);
  const [signedBy, setSignedBy] = useState("");
  const [declining, setDeclining] = useState(false);
  const [comment, setComment] = useState("");
  const current = clientProjectMoney(detail).breakdown.total;
  const label = portalChangeOrderLabel(co);
  const pending = co.status === "sent" && !props.olderVersion;

  const done = () => qc.invalidateQueries({ queryKey: ["portal-project", projectId] });
  const approveMut = useMutation({
    mutationFn: () => approvePortalChangeOrder(co.id, signedBy),
    onSuccess: () => {
      done();
      toast({ title: "Change order approved" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  const declineMut = useMutation({
    mutationFn: () => declinePortalChangeOrder(co.id, comment),
    onSuccess: () => {
      done();
      toast({ title: "Change order declined" });
      setDeclining(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  const days = co.schedule_impact_days ?? 0;

  return (
    <>
      <PanelCard>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Change to your contract</p>
        <p className={cn("mt-0.5 text-3xl font-extrabold tracking-tight tabular-nums", co.amount < 0 ? "text-success" : "text-foreground")}>
          {co.amount < 0 ? "−" : "+"}
          {hubMoney(Math.abs(co.amount))}
        </p>
        <div className="mt-3">
          {pending ? (
            <>
              <MoneyLine label="Current contract" value={hubMoney(current)} />
              <MoneyLine label="New contract total" value={hubMoney(current + Number(co.amount))} strong />
            </>
          ) : (
            <MoneyLine label={co.status === "approved" ? "Your contract now (incl. this change)" : "Your contract"} value={hubMoney(current)} strong />
          )}
          {days !== 0 && (
            <MoneyLine
              label="Schedule impact"
              value={days > 0 ? `Adds ${days} working day${days === 1 ? "" : "s"}` : `Saves ${Math.abs(days)} working day${Math.abs(days) === 1 ? "" : "s"}`}
            />
          )}
        </div>
      </PanelCard>

      <PanelCard className="space-y-3">
        {co.status === "approved" ? (
          <p className="flex items-center gap-2 text-sm font-bold text-success">
            <CheckCircle2 className="h-5 w-5" /> Approved by {co.approved_by ?? "you"}
            {co.approved_at ? ` on ${hubDate(co.approved_at)}` : ""}
          </p>
        ) : co.status === "declined" ? (
          <p className="text-sm text-muted-foreground">You declined this change{co.declined_at ? ` on ${hubDate(co.declined_at)}` : ""}.</p>
        ) : mode === "preview" ? (
          <>
            <Button className="h-12 w-full text-base font-bold" disabled>
              Approve
            </Button>
            <p className="text-xs text-muted-subtle">Preview — your client approves or declines here.</p>
          </>
        ) : declining ? (
          <>
            <Label htmlFor="hub-co-decline" className="text-xs font-semibold text-muted-foreground">
              Let us know why (optional)
            </Label>
            <Textarea id="hub-co-decline" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Anything we should know?" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeclining(false)}>
                Back
              </Button>
              <Button variant="outline" className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={declineMut.isPending} onClick={() => declineMut.mutate()}>
                {declineMut.isPending ? "Sending…" : "Confirm decline"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Label htmlFor="hub-co-sign" className="text-xs font-semibold text-muted-foreground">
              Type your full name to approve
            </Label>
            <Input id="hub-co-sign" value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Full name" className="h-11" autoComplete="name" />
            <Button className="h-12 w-full text-base font-bold" disabled={!signedBy.trim() || approveMut.isPending} onClick={() => approveMut.mutate()}>
              <Check className="h-4 w-4" />
              {approveMut.isPending ? "Approving…" : "Approve change"}
            </Button>
            <div className="flex justify-between text-sm">
              <button type="button" className={cn("rounded font-semibold text-primary hover:underline", focusRing)} onClick={() => ask(`${label} (${co.title})`)}>
                Ask a question
              </button>
              <button type="button" className={cn("rounded font-semibold text-muted-foreground hover:text-destructive", focusRing)} onClick={() => setDeclining(true)}>
                Decline
              </button>
            </div>
          </>
        )}
        <PdfButton onClick={() => window.print()} />
      </PanelCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

function InvoicePanel(props: HubDocumentDesktopProps) {
  const { detail, mode, projectBase } = props;
  const inv = props.live as PortalInvoice;
  const ask = useAskQuestion(projectBase);
  const balance = invoiceBalance({ ...inv, status: inv.status as "sent" });
  const paid = inv.status === "paid" || balance <= 0.004;
  const late = !paid && effectiveInvoiceStatus({ ...inv, status: inv.status as "sent" }) === "overdue";
  const payments = (detail.payments ?? [])
    .map((p) => ({ p, applied: p.applied_to.filter((a) => a.invoice_id === inv.id).reduce((s, a) => s + Number(a.amount), 0) }))
    .filter((x) => x.applied > 0)
    .sort((a, b) => b.p.paid_on.localeCompare(a.p.paid_on));
  const itemLines = (inv.items ?? []).map((i) => i.description).filter(Boolean);
  // No line items → the invoice's note ("Deposit", "Progress payment 2") says what it's for.
  const lines = itemLines.length ? itemLines : inv.notes ? [inv.notes.split("\n")[0]] : [];
  const label = `Invoice ${inv.invoice_number ?? ""}`.trim();

  return (
    <>
      <PanelCard>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">{paid ? "Paid in full" : "Amount due"}</p>
        <p className="mt-0.5 text-3xl font-extrabold tracking-tight tabular-nums text-foreground">{hubMoney(paid ? Number(inv.amount) : balance)}</p>
        <div className="mt-3">
          {!paid && inv.due_date && (
            <MoneyLine label="Due date" value={<span className={cn(late && "text-destructive")}>{hubDate(inv.due_date)}{late ? " · overdue" : ""}</span>} />
          )}
          {paid && inv.paid_at && <MoneyLine label="Paid on" value={hubDate(inv.paid_at)} />}
          <MoneyLine label="Invoice total" value={hubMoney(Number(inv.amount))} />
        </div>
        <div className="mt-3 border-t border-hairline pt-3 text-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">For</p>
          <p className="mt-0.5 font-semibold text-foreground">{detail.project.name}</p>
          {lines.length > 0 && (
            <p className="text-muted-foreground">
              {lines.slice(0, 3).join(" · ")}
              {lines.length > 3 ? ` · +${lines.length - 3} more` : ""}
            </p>
          )}
        </div>
      </PanelCard>

      <PanelCard>
        <h2 className="text-sm font-bold text-foreground">Payments</h2>
        {payments.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No payments on this invoice yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hairline">
            {payments.map(({ p, applied }) => {
              const voided = p.status === "void";
              return (
                <li key={p.token ?? p.created_at} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className={cn("min-w-0", voided && "text-muted-foreground line-through")}>
                    <span className="block font-semibold text-foreground">{hubDate(p.paid_on)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {paymentMethodLabel(p.method)}
                      {voided ? " · voided" : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={cn("font-bold tabular-nums text-foreground", voided && "text-muted-foreground line-through")}>{hubMoney(applied)}</span>
                    {!voided && p.token && (
                      <a href={`/receipt/${p.token}`} target="_blank" rel="noreferrer" className={cn("rounded text-muted-subtle hover:text-primary", focusRing)} aria-label={`Receipt ${p.receipt_number ?? ""}`}>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      <PanelCard id="pay" className="space-y-3">
        {!paid && (
          <div>
            <h2 className="text-sm font-bold text-foreground">How to pay</h2>
            <p className="mt-1 text-sm text-muted-foreground">{HOW_TO_PAY}</p>
          </div>
        )}
        <ContactDetails detail={detail} />
        {mode === "portal" && (
          <Button variant="outline" className="h-10 w-full font-semibold" onClick={() => ask(label)}>
            <MessageCircle className="h-4 w-4" /> Ask about this invoice
          </Button>
        )}
        <PdfButton onClick={() => window.print()} />
      </PanelCard>
    </>
  );
}
