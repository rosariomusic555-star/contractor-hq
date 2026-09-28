import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuoteTracking } from "@/hooks/use-quote-tracking";
import { ClientSelectionGroups } from "@/components/selections/ClientSelectionGroups";
import { clientGroupLike, groupPrice, missingRequired, priceLabel } from "@/lib/selections";
import { cn, formatCurrency } from "@/lib/utils";
import { seedOptionalSelection, selectionWrites } from "@/lib/sharedQuoteSelection";
import {
  getSharedQuote,
  getSignedImageUrls,
  quoteLineTotal,
  signSharedQuote,
  setSharedQuoteItemSelection,
  type SharedQuoteSection,
  setSharedQuoteSelection,
} from "@/lib/api";

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

export default function SharedQuotePage() {
  const { token = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [signerName, setSignerName] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["shared-quote", token],
    queryFn: () => getSharedQuote(token),
    enabled: token.length > 0,
  });

  // Which optional sections / items the client has checked — seeded from
  // what's saved and SAVED on every tap (setSharedQuoteItemSelection), so the
  // signed total and the deposit invoice match what they see here. Local
  // state is the optimistic copy; a failed save reverts it.
  const [sectionSelected, setSectionSelected] = useState<Record<string, boolean>>({});
  const [itemSelected, setItemSelected] = useState<Record<string, boolean>>({});
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !data) return;
    const seed = seedOptionalSelection(data.sections);
    setSectionSelected(seed.sections);
    setItemSelected(seed.items);
    seeded.current = true;
  }, [data]);

  const [savingSelection, setSavingSelection] = useState(0);
  const saveSelection = async (section: SharedQuoteSection, target: { kind: "section" } | { kind: "item"; itemId: string }, selected: boolean) => {
    const writes = selectionWrites(section, target, selected);
    if (writes.length === 0) return;
    const prevSections = sectionSelected;
    const prevItems = itemSelected;
    if (target.kind === "section") setSectionSelected((p) => ({ ...p, [section.id]: selected }));
    setItemSelected((p) => ({ ...p, ...Object.fromEntries(writes.map((w) => [w.itemId, w.selected])) }));
    setSavingSelection((n) => n + 1);
    try {
      for (const w of writes) await setSharedQuoteItemSelection(token, w.itemId, w.selected);
    } catch (err) {
      setSectionSelected(prevSections);
      setItemSelected(prevItems);
      toast({ title: "Couldn't save your choice", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingSelection((n) => n - 1);
    }
  };

  // Quote activity (0117): views / time / sections — never while signed in
  // to the app (the contractor), and ignored server-side for the team.
  const { trackEvent } = useQuoteTracking({ channel: "link", token, enabled: !!data });

  // Client Selections (0115): picks are saved as a draft on every tap.
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const pickMut = useMutation({
    mutationFn: ({ groupId, ids }: { groupId: string; ids: string[] }) => setSharedQuoteSelection(token, groupId, ids),
    onError: (err: Error) => toast({ title: "Couldn't save your choice", description: err.message, variant: "destructive" }),
  });
  const choose = (groupId: string, ids: string[]) => {
    setPicks((p) => ({ ...p, [groupId]: ids }));
    pickMut.mutate({ groupId, ids });
  };
  const selectionImagePaths = useMemo(
    () => (data?.sections ?? []).flatMap((s) => (s.selections ?? []).flatMap((g) => g.options.map((o) => o.image_path).filter(Boolean) as string[])),
    [data],
  );
  const { data: selectionImageUrls = {} } = useQuery({
    queryKey: ["shared-selection-image-urls", token, selectionImagePaths.join(",")],
    queryFn: () => getSignedImageUrls(selectionImagePaths),
    enabled: selectionImagePaths.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const signMut = useMutation({
    mutationFn: () => signSharedQuote(token, signerName.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-quote", token] });
      toast({
        title: `Quote approved. Thank you, ${signerName.trim()}. We'll be in touch shortly.`,
      });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  // Every item image's storage_path, signed in one batch — get_shared_quote
  // returns raw paths (not URLs); the anon storage.objects policy scoped to
  // shared quotes (0023) decides whether this call actually succeeds.
  // `i.images ?? []` guards a quote fetched before migration 0026 ran —
  // the RPC simply won't have an `images` key on each item yet.
  const allImagePaths = useMemo(
    () =>
      (data?.sections ?? []).flatMap((s) =>
        s.items.flatMap((i) => (i.images ?? []).map((img) => img.storage_path)),
      ),
    [data],
  );
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["shared-quote-image-urls", token, allImagePaths.join(",")],
    queryFn: () => getSignedImageUrls(allImagePaths),
    enabled: allImagePaths.length > 0,
    staleTime: 30 * 60 * 1000,
  });
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (!token || isError) {
    return <CenteredNotice>Quote not found.</CenteredNotice>;
  }
  if (isLoading) {
    return <CenteredNotice>Loading quote…</CenteredNotice>;
  }
  if (!data) {
    return <CenteredNotice>Quote not found.</CenteredNotice>;
  }

  const { quote, project, client, sections } = data;

  const isSectionSelected = (sectionId: string) => sectionSelected[sectionId] ?? true;
  const isItemSelected = (itemId: string) => itemSelected[itemId] ?? true;
  const isIncluded = (section: SharedQuoteSection, item: SharedQuoteSection["items"][number]) => {
    if (section.is_optional) return isSectionSelected(section.id);
    if (item.is_optional) return isItemSelected(item.id);
    return true;
  };

  // Required items only, regardless of what's currently checked — the
  // guaranteed floor of the quote.
  const baseSubtotal = sections.reduce(
    (sum, section) =>
      sum +
      (section.is_optional
        ? 0
        : section.items.reduce((s, item) => s + (item.is_optional ? 0 : quoteLineTotal(item)), 0)),
    0,
  );
  const optionalCount = sections.reduce(
    (n, section) =>
      n + (section.is_optional ? section.items.length : section.items.filter((i) => i.is_optional).length),
    0,
  );
  // Base + whatever's currently checked — moves live as the client toggles
  // optional sections/items above.
  // Selections count on a required section, or an optional one the client
  // kept — each group's picks (or its default).
  const sectionKept = (section: SharedQuoteSection) => !section.is_optional || isSectionSelected(section.id);
  const keptGroups = sections.filter(sectionKept).flatMap((section) => (section.selections ?? []).map((g) => ({ g, section })));
  const selectionsSubtotal = keptGroups.reduce((sum, { g }) => {
    const like = clientGroupLike(g);
    return sum + groupPrice(like, picks[g.id] ?? like.picked);
  }, 0);
  const missing = missingRequired(keptGroups.map(({ g }) => clientGroupLike(g)), picks);
  const subtotal =
    sections.reduce(
      (sum, section) =>
        sum +
        section.items.reduce((s, item) => (isIncluded(section, item) ? s + quoteLineTotal(item) : s), 0),
      0,
    ) + selectionsSubtotal;
  // Deposit is a percentage of the full quote total — required items plus
  // whatever optional work the client currently has checked — matching how
  // the deposit is sized everywhere else a quote total is shown.
  const deposit = (subtotal * Number(quote.deposit_percentage)) / 100;
  const isApproved = quote.status === "approved";
  // Only a quote that's out with the client can be signed (sign_quote 0141):
  // a draft opened from Preview, or a declined one, is view-only.
  const canSign = quote.status === "sent";

  return (
    <PageShell>
      <div className="bg-white rounded-xl border border-border/60 shadow-sm p-6 md:p-10 space-y-8">
        <header className="space-y-2">
          <p className="text-sm font-bold tracking-wide text-primary">ContractorPro</p>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <h1 className="min-w-0 text-2xl font-bold text-foreground [overflow-wrap:anywhere]">
              {project ? `${project.name} — Proposal` : "Proposal"}
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              {isApproved && <span className="badge-status badge-paid shrink-0">Approved ✓</span>}
              <Button
                variant="outline"
                size="sm"
                className="no-print"
                onClick={() => {
                  trackEvent("pdf_downloaded", {});
                  window.print();
                }}
              >
                Print / Save as PDF
              </Button>
            </div>
          </div>
          {client?.name && (
            <p className="text-muted-foreground [overflow-wrap:anywhere]">Prepared for {client.name}</p>
          )}
        </header>

        {sections.length > 0 && (
          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section.id} data-track-section={section.name}>
              <SectionBlock
                section={section}
                sectionChecked={isSectionSelected(section.id)}
                itemChecked={isItemSelected}
                locked={!canSign}
                signedUrls={signedUrls}
                onImageClick={setLightboxUrl}
                onToggleSection={(checked) => {
                  void saveSelection(section, { kind: "section" }, checked);
                  trackEvent("optional_changed", { summary: `${checked ? "Added" : "Dropped"} optional section ${section.name}`, section: section.name, selected: checked });
                }}
                onToggleItem={(itemId, checked) => {
                  void saveSelection(section, { kind: "item", itemId }, checked);
                  const item = section.items.find((i) => i.id === itemId);
                  trackEvent("optional_changed", { summary: `${checked ? "Added" : "Dropped"} ${item?.name ?? "an optional item"}`, item: item?.name, selected: checked });
                }}
                selectionsTotal={(section.selections ?? []).reduce((sum, g) => {
                  const like = clientGroupLike(g);
                  return sum + groupPrice(like, picks[g.id] ?? like.picked);
                }, 0)}
                selections={
                  (section.selections ?? []).length > 0 && sectionKept(section) ? (
                    <ClientSelectionGroups
                      groups={section.selections!}
                      picks={picks}
                      onChange={canSign ? choose : undefined}
                      locked={!canSign}
                      imageUrls={selectionImageUrls}
                      flagMissing={missing.length > 0}
                    />
                  ) : null
                }
              />
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/40 p-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Quote total</span>
            <span className="text-xl font-bold text-foreground">{formatCurrency(subtotal)}</span>
          </div>
          {optionalCount > 0 && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Base (required)</span>
                <span className="font-semibold text-foreground">{formatCurrency(baseSubtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Optional items selected</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(subtotal - baseSubtotal)}
                </span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between text-sm pt-1">
            <span className="text-muted-foreground">
              Deposit due ({quote.deposit_percentage}%)
            </span>
            <span className="font-semibold text-foreground">{formatCurrency(deposit)}</span>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Remaining balance due upon completion
          </p>
        </div>

        {quote.notes && (
          <div className="space-y-1.5">
            <h2 className="font-semibold text-foreground">Notes</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        {quote.terms && (
          <div className="space-y-1.5">
            <h2 className="font-semibold text-foreground">Terms &amp; conditions</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.terms}</p>
          </div>
        )}

        {isApproved ? (
          <div className="rounded-xl border border-success/30 bg-success/10 p-5">
            <p className="font-semibold text-success">Approved ✓</p>
            <p className="text-sm text-foreground mt-1">
              Approved by {quote.signed_by ?? "the client"}
              {quote.signed_at && ` on ${new Date(quote.signed_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}`}
            </p>
          </div>
        ) : !canSign ? (
          <div className="rounded-xl border border-border bg-muted/40 p-5">
            <p className="font-semibold text-foreground">{quote.status === "declined" ? "This quote was declined" : "This quote isn't ready to sign yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {quote.status === "declined"
                ? "If you'd like to go ahead after all, ask your contractor to send it again."
                : "Your contractor is still preparing it — they'll send it to you when it's ready."}
            </p>
          </div>
        ) : (
          <div className="space-y-4 border-t border-border pt-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Approve this quote</h2>
              <p className="text-sm text-muted-foreground mt-1">
                By signing below, you confirm you have read and agree to the terms above.
              </p>
            </div>
            {keptGroups.length > 0 && (
              <div className="max-w-md space-y-1 rounded-xl border border-border bg-muted/40 p-4 text-sm">
                <p className="font-semibold text-foreground">Your selections</p>
                {keptGroups.map(({ g, section }) => {
                  const ids = picks[g.id] ?? g.picked;
                  const eff = ids.length ? ids : g.options.filter((o) => o.is_default).map((o) => o.id);
                  const chosen = g.options.filter((o) => eff.includes(o.id));
                  return (
                    <p key={g.id} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        {section.name} · {g.name}
                      </span>
                      <span className={chosen.length ? "text-right font-semibold text-foreground" : "text-right font-semibold text-destructive"}>
                        {chosen.map((o) => `${o.name}${o.price_delta ? ` (${priceLabel(o.price_delta)})` : ""}`).join(", ") || "Not chosen yet"}
                      </span>
                    </p>
                  );
                })}
                <p className="flex justify-between border-t border-border pt-1.5 font-bold text-foreground">
                  <span>Total</span>
                  <span>{formatCurrency(subtotal)}</span>
                </p>
              </div>
            )}
            {missing.length > 0 && (
              <p className="text-sm font-semibold text-destructive">Please choose {missing.map((g) => `"${g.name}"`).join(", ")} before signing.</p>
            )}
            <div className="space-y-2 max-w-sm">
              <Label htmlFor="signer-name">Your full name</Label>
              <Input
                id="signer-name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <Button
              onClick={() => signerName.trim() && signMut.mutate()}
              disabled={!signerName.trim() || signMut.isPending || missing.length > 0 || pickMut.isPending || savingSelection > 0}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {signMut.isPending ? "Submitting…" : "Approve & sign"}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!lightboxUrl} onOpenChange={(open) => !open && setLightboxUrl(null)}>
        <DialogContent className="max-w-lg gap-3 p-4">
          <DialogTitle className="text-sm font-bold text-foreground">Photo</DialogTitle>
          {lightboxUrl && (
            <img src={lightboxUrl} alt="" className="max-h-[70vh] w-full rounded-xl object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function SectionBlock({
  section,
  sectionChecked,
  itemChecked,
  locked,
  signedUrls,
  onImageClick,
  onToggleSection,
  onToggleItem,
  selections,
  selectionsTotal,
}: {
  section: SharedQuoteSection;
  sectionChecked: boolean;
  itemChecked: (itemId: string) => boolean;
  locked: boolean;
  signedUrls: Record<string, string>;
  onImageClick: (url: string) => void;
  onToggleSection: (checked: boolean) => void;
  onToggleItem: (itemId: string, checked: boolean) => void;
  /** Client Selections for this section (0115). */
  selections?: ReactNode;
  /** What this section's current choices add — kept in the section subtotal
   * so it moves live as the client picks (selections belong to the section,
   * not to one line item). */
  selectionsTotal?: number;
}) {
  if (section.is_optional) {
    const subtotal = section.items.reduce((sum, i) => sum + quoteLineTotal(i), 0) + (selectionsTotal ?? 0);

    return (
      <div className="space-y-3">
        <label className={cn("flex items-start gap-3 select-none", locked ? "cursor-default" : "cursor-pointer")}>
          <Checkbox
            className="mt-0.5 shrink-0"
            checked={sectionChecked}
            disabled={locked}
            onCheckedChange={(c) => onToggleSection(c === true)}
          />
          <span className="min-w-0">
            <span className="font-semibold text-foreground [overflow-wrap:anywhere]">{section.name}</span>
            <span className="text-sm text-muted-foreground"> — Add to my quote</span>
          </span>
        </label>
        <div className={cn("space-y-2", !sectionChecked && "opacity-40 pointer-events-none")}>
          <ItemsTable
            items={section.items}
            showItemCheckbox={false}
            itemChecked={itemChecked}
            locked={locked}
            signedUrls={signedUrls}
            onImageClick={onImageClick}
            onToggleItem={onToggleItem}
          />
          {sectionChecked && (
            <p className="text-right text-sm font-medium text-foreground">
              Subtotal{selectionsTotal ? " (incl. your choices)" : ""}: {formatCurrency(subtotal)}
            </p>
          )}
          {selections}
        </div>
      </div>
    );
  }

  const subtotal =
    section.items.reduce((sum, item) => sum + (!item.is_optional || itemChecked(item.id) ? quoteLineTotal(item) : 0), 0) + (selectionsTotal ?? 0);

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground [overflow-wrap:anywhere]">{section.name}</h3>
      <ItemsTable
        items={section.items}
        showItemCheckbox
        itemChecked={itemChecked}
        locked={locked}
        signedUrls={signedUrls}
        onImageClick={onImageClick}
        onToggleItem={onToggleItem}
      />
      <p className="text-right text-sm font-medium text-foreground">
        Subtotal{selectionsTotal ? " (incl. your choices)" : ""}: {formatCurrency(subtotal)}
      </p>
      {selections}
    </div>
  );
}

function ItemsTable({
  items,
  showItemCheckbox,
  itemChecked,
  locked,
  signedUrls,
  onImageClick,
  onToggleItem,
}: {
  items: SharedQuoteSection["items"];
  showItemCheckbox: boolean;
  itemChecked: (itemId: string) => boolean;
  locked: boolean;
  signedUrls: Record<string, string>;
  onImageClick: (url: string) => void;
  onToggleItem: (itemId: string, checked: boolean) => void;
}) {
  return (
    <div className="divide-y divide-border/60 border-y border-border/60">
      {items.map((item) => {
        const included = showItemCheckbox && item.is_optional ? itemChecked(item.id) : true;
        const qty = item.quantity == null ? 1 : Number(item.quantity);
        const unit = item.unit?.trim();
        const showMeta = qty !== 1 || !!unit || !!item.description;
        // Guards a quote fetched before migration 0026 ran (see above).
        const images = item.images ?? [];
        return (
          <div
            key={item.id}
            className={cn("flex items-start justify-between gap-3 py-2.5", !included && "opacity-40")}
          >
            <div className="flex min-w-0 flex-1 items-start gap-2">
              {showItemCheckbox && item.is_optional && (
                <Checkbox
                  className="mt-0.5 shrink-0"
                  checked={itemChecked(item.id)}
                  disabled={locked}
                  onCheckedChange={(c) => onToggleItem(item.id, c === true)}
                />
              )}
              <div className="min-w-0">
                <p className="text-sm text-foreground [overflow-wrap:anywhere]">{item.name || "—"}</p>
                {showMeta && (
                  <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {(qty !== 1 || unit) &&
                      `${qty}${unit ? ` ${unit}` : ""} × ${formatCurrency(Number(item.price))}`}
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
                          <img
                            src={signedUrls[img.storage_path]}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ) : (
                        <div
                          key={img.id}
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted"
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-subtle" />
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
            <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
              {formatCurrency(quoteLineTotal(item))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
