import { useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import {
  getSharedQuote,
  setSharedQuoteItemSelection,
  signSharedQuote,
  sharedItemIncluded,
  type SharedQuoteSection,
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

  const invalidate = () => qc.invalidateQueries({ queryKey: ["shared-quote", token] });

  const toggleItemMut = useMutation({
    mutationFn: (v: { itemId: string; selected: boolean }) =>
      setSharedQuoteItemSelection(token, v.itemId, v.selected),
    onSuccess: invalidate,
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const toggleSectionMut = useMutation({
    mutationFn: async (v: { itemIds: string[]; selected: boolean }) => {
      await Promise.all(v.itemIds.map((id) => setSharedQuoteItemSelection(token, id, v.selected)));
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const signMut = useMutation({
    mutationFn: () => signSharedQuote(token, signerName.trim()),
    onSuccess: () => {
      invalidate();
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

  const subtotal = sections.reduce(
    (sum, section) =>
      sum +
      section.items.reduce(
        (s, item) => (sharedItemIncluded(section, item) ? s + Number(item.price) : s),
        0,
      ),
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
            <h1 className="text-2xl font-bold text-foreground">{project.name} — Proposal</h1>
            {isApproved && <span className="badge-status badge-paid shrink-0">Approved ✓</span>}
          </div>
          {client?.name && <p className="text-muted-foreground">Prepared for {client.name}</p>}
        </header>

        {sections.length > 0 && (
          <div className="space-y-6">
            {sections.map((section) => (
              <SectionBlock
                key={section.id}
                section={section}
                onToggleItem={(itemId, selected) => toggleItemMut.mutate({ itemId, selected })}
                onToggleSection={(selected) =>
                  toggleSectionMut.mutate({
                    itemIds: section.items.map((i) => i.id),
                    selected,
                  })
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
  onToggleItem,
  onToggleSection,
}: {
  section: SharedQuoteSection;
  onToggleItem: (itemId: string, selected: boolean) => void;
  onToggleSection: (selected: boolean) => void;
}) {
  if (section.is_optional) {
    const selected = section.items.length > 0 && section.items.every((i) => i.client_selected);
    const subtotal = section.items.reduce((sum, i) => sum + Number(i.price), 0);

    return (
      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <Checkbox
            checked={selected}
            onCheckedChange={(c) => onToggleSection(c === true)}
          />
          <span className="font-semibold text-foreground">{section.name}</span>
          <span className="text-sm text-muted-foreground">— Add to my quote</span>
        </label>
        <div className={cn("space-y-2", !selected && "opacity-40 pointer-events-none")}>
          <ItemsTable items={section.items} showItemCheckbox={false} onToggleItem={onToggleItem} />
          {selected && (
            <p className="text-right text-sm font-medium text-foreground">
              Subtotal: {formatCurrency(subtotal)}
            </p>
          )}
        </div>
      </div>
    );
  }

  const subtotal = section.items.reduce(
    (sum, item) => (sharedItemIncluded(section, item) ? sum + Number(item.price) : sum),
    0,
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground">{section.name}</h3>
      <ItemsTable
        items={section.items}
        showItemCheckbox
        onToggleItem={onToggleItem}
        includedFor={(item) => sharedItemIncluded(section, item)}
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
  onToggleItem,
  includedFor,
}: {
  items: SharedQuoteSection["items"];
  showItemCheckbox: boolean;
  onToggleItem: (itemId: string, selected: boolean) => void;
  includedFor?: (item: SharedQuoteSection["items"][number]) => boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground text-left">
            <th className="py-1 font-medium">Item</th>
            <th className="py-1 font-medium">Description</th>
            <th className="py-1 font-medium text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const included = includedFor ? includedFor(item) : true;
            return (
              <tr
                key={item.id}
                className={cn(
                  "border-b border-border/60 last:border-0",
                  !included && "opacity-40",
                )}
              >
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    {showItemCheckbox && item.is_optional && (
                      <Checkbox
                        checked={item.client_selected}
                        onCheckedChange={(c) => onToggleItem(item.id, c === true)}
                      />
                    )}
                    <span className="text-foreground">{item.name || "—"}</span>
                  </div>
                </td>
                <td className="py-2 pr-2 text-muted-foreground">{item.description}</td>
                <td className="py-2 text-right text-foreground whitespace-nowrap">
                  {formatCurrency(Number(item.price))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
