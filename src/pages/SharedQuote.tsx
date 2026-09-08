import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import { getSharedQuote, signSharedQuote, type SharedQuoteSection } from "@/lib/api";

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

  // Which optional sections / items the client currently has checked. This
  // is purely local, view-only state — it's never written to Supabase.
  // Only the final "Approve & sign" action touches the database. Seeded
  // once, all-selected, the first time the quote loads.
  const [sectionSelected, setSectionSelected] = useState<Record<string, boolean>>({});
  const [itemSelected, setItemSelected] = useState<Record<string, boolean>>({});
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !data) return;
    const sections: Record<string, boolean> = {};
    const items: Record<string, boolean> = {};
    for (const section of data.sections) {
      if (section.is_optional) sections[section.id] = true;
      for (const item of section.items) {
        if (item.is_optional) items[item.id] = true;
      }
    }
    setSectionSelected(sections);
    setItemSelected(items);
    seeded.current = true;
  }, [data]);

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

  const subtotal = sections.reduce(
    (sum, section) =>
      sum + section.items.reduce((s, item) => (isIncluded(section, item) ? s + Number(item.price) : s), 0),
    0,
  );
  const deposit = (subtotal * Number(quote.deposit_percentage)) / 100;
  const isApproved = quote.status === "approved";

  return (
    <PageShell>
      <div className="bg-white rounded-xl border border-border/60 shadow-sm p-6 md:p-10 space-y-8">
        <header className="space-y-2">
          <p className="text-sm font-bold tracking-wide text-primary">ContractorPro</p>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <h1 className="min-w-0 text-2xl font-bold text-foreground [overflow-wrap:anywhere]">
              {project ? `${project.name} — Proposal` : "Proposal"}
            </h1>
            {isApproved && <span className="badge-status badge-paid shrink-0">Approved ✓</span>}
          </div>
          {client?.name && (
            <p className="text-muted-foreground [overflow-wrap:anywhere]">Prepared for {client.name}</p>
          )}
        </header>

        {sections.length > 0 && (
          <div className="space-y-6">
            {sections.map((section) => (
              <SectionBlock
                key={section.id}
                section={section}
                sectionChecked={isSectionSelected(section.id)}
                itemChecked={isItemSelected}
                onToggleSection={(checked) =>
                  setSectionSelected((prev) => ({ ...prev, [section.id]: checked }))
                }
                onToggleItem={(itemId, checked) =>
                  setItemSelected((prev) => ({ ...prev, [itemId]: checked }))
                }
              />
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/40 p-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-xl font-bold text-foreground">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
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
        ) : (
          <div className="space-y-4 border-t border-border pt-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Approve this quote</h2>
              <p className="text-sm text-muted-foreground mt-1">
                By signing below, you confirm you have read and agree to the terms above.
              </p>
            </div>
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
              disabled={!signerName.trim() || signMut.isPending}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {signMut.isPending ? "Submitting…" : "Approve & sign"}
            </Button>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function SectionBlock({
  section,
  sectionChecked,
  itemChecked,
  onToggleSection,
  onToggleItem,
}: {
  section: SharedQuoteSection;
  sectionChecked: boolean;
  itemChecked: (itemId: string) => boolean;
  onToggleSection: (checked: boolean) => void;
  onToggleItem: (itemId: string, checked: boolean) => void;
}) {
  if (section.is_optional) {
    const subtotal = section.items.reduce((sum, i) => sum + Number(i.price), 0);

    return (
      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <Checkbox
            className="mt-0.5 shrink-0"
            checked={sectionChecked}
            onCheckedChange={(c) => onToggleSection(c === true)}
          />
          <span className="min-w-0">
            <span className="font-semibold text-foreground [overflow-wrap:anywhere]">{section.name}</span>
            <span className="text-sm text-muted-foreground"> — Add to my quote</span>
          </span>
        </label>
        <div className={cn("space-y-2", !sectionChecked && "opacity-40 pointer-events-none")}>
          <ItemsTable items={section.items} showItemCheckbox={false} itemChecked={itemChecked} onToggleItem={onToggleItem} />
          {sectionChecked && (
            <p className="text-right text-sm font-medium text-foreground">
              Subtotal: {formatCurrency(subtotal)}
            </p>
          )}
        </div>
      </div>
    );
  }

  const subtotal = section.items.reduce(
    (sum, item) => sum + (!item.is_optional || itemChecked(item.id) ? Number(item.price) : 0),
    0,
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground [overflow-wrap:anywhere]">{section.name}</h3>
      <ItemsTable
        items={section.items}
        showItemCheckbox
        itemChecked={itemChecked}
        onToggleItem={onToggleItem}
      />
      <p className="text-right text-sm font-medium text-foreground">
        Subtotal: {formatCurrency(subtotal)}
      </p>
    </div>
  );
}

function ItemsTable({
  items,
  showItemCheckbox,
  itemChecked,
  onToggleItem,
}: {
  items: SharedQuoteSection["items"];
  showItemCheckbox: boolean;
  itemChecked: (itemId: string) => boolean;
  onToggleItem: (itemId: string, checked: boolean) => void;
}) {
  return (
    <div className="divide-y divide-border/60 border-y border-border/60">
      {items.map((item) => {
        const included = showItemCheckbox && item.is_optional ? itemChecked(item.id) : true;
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
                  onCheckedChange={(c) => onToggleItem(item.id, c === true)}
                />
              )}
              <div className="min-w-0">
                <p className="text-sm text-foreground [overflow-wrap:anywhere]">{item.name || "—"}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {item.description}
                  </p>
                )}
              </div>
            </div>
            <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
              {formatCurrency(Number(item.price))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
