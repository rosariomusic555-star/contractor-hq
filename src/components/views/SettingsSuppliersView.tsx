import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronLeft, Plus, Trash2, Truck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier, type Supplier } from "@/lib/api";
import { BackLink } from "@/components/common/BackLink";

const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";

/**
 * Real, persisted CRUD list (suppliers table, 0062) — feeds the Supplier
 * combobox on Material orders (src/components/common/SupplierCombobox.tsx).
 * Saves each action immediately, same as the Project types editor — not the
 * draft+Save pattern. Deleting a supplier here never touches existing
 * delivery records: material_orders.supplier is plain denormalized text,
 * not a foreign key into this table.
 */
export function SettingsSuppliersView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: listSuppliers,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["suppliers"] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const createMut = useMutation({
    mutationFn: (name: string) => createSupplier({ name }),
    onSuccess: invalidate,
    onError,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Supplier, "name" | "phone" | "email" | "address" | "tax_rate">> }) =>
      updateSupplier(id, patch),
    onSuccess: (_d, { patch }) => {
      invalidate();
      // A rate (or a renamed supplier) re-figures open jobs' lines in the DB (0163).
      if ("tax_rate" in patch || "name" in patch) qc.invalidateQueries({ queryKey: ["materials"] });
    },
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Supplier deleted" });
    },
    onError,
  });

  const addSupplier = () => {
    if (createMut.isPending) return;
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    createMut.mutate(name);
  };

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Suppliers" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <BackLink
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >Settings</BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Suppliers</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <Truck className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Who you buy from — yards, distributors</span>
        </div>

        <div className="bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Feeds the Supplier field on Material orders and Cost plan lines. Separate from Product Catalog manufacturers
            — this is who you order from, not who makes the product. Deleting a supplier here doesn't
            change any existing delivery records. A supplier in a different tax area can have its own sales tax rate
            (under Details); lines with that supplier use it instead of the{" "}
            <Link to="/settings/cost-plan-tax" className="font-semibold text-primary hover:text-primary/80">
              default rate
            </Link>
            .
          </p>

          {isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : suppliers.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No suppliers yet — add one below.</p>
          ) : (
            <div className="mt-4 divide-y divide-hairline">
              {suppliers.map((s) => (
                <SupplierRow
                  key={s.id}
                  supplier={s}
                  onRename={(name) => updateMut.mutate({ id: s.id, patch: { name } })}
                  onUpdateContact={(patch) => updateMut.mutate({ id: s.id, patch })}
                  onDelete={() => deleteMut.mutate(s.id)}
                />
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSupplier()}
              placeholder="New supplier name"
              className="h-11"
            />
            <Button
              onClick={addSupplier}
              disabled={!newName.trim() || createMut.isPending}
              className="h-11 shrink-0 rounded-xl font-bold"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SupplierRow({
  supplier,
  onRename,
  onUpdateContact,
  onDelete,
}: {
  supplier: Supplier;
  onRename: (name: string) => void;
  onUpdateContact: (patch: Partial<Pick<Supplier, "phone" | "email" | "address" | "tax_rate">>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(supplier.name);
  const [phone, setPhone] = useState(supplier.phone ?? "");
  const [email, setEmail] = useState(supplier.email ?? "");
  const [address, setAddress] = useState(supplier.address ?? "");
  const [taxRate, setTaxRate] = useState(supplier.tax_rate == null ? "" : String(supplier.tax_rate));
  const hasContact = !!(supplier.phone || supplier.email || supplier.address || supplier.tax_rate != null);
  /** Blank = the default rate; otherwise 0–100. */
  const commitTaxRate = () => {
    const t = taxRate.trim();
    const next = t === "" ? null : Number(t);
    if (next != null && (!isFinite(next) || next < 0 || next > 100)) {
      setTaxRate(supplier.tax_rate == null ? "" : String(supplier.tax_rate));
      return;
    }
    if (next !== (supplier.tax_rate == null ? null : Number(supplier.tax_rate))) onUpdateContact({ tax_rate: next });
  };
  const [expanded, setExpanded] = useState(hasContact);

  return (
    <div className="py-2.5">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (trimmed && trimmed !== supplier.name) onRename(trimmed);
            else setName(supplier.name);
          }}
          className="h-10 flex-1 border-transparent bg-transparent px-2 font-semibold hover:border-input hover:bg-muted focus-visible:border-primary focus-visible:bg-background"
        />

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={hasContact ? "Supplier details" : "Add supplier details"}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Details
          {supplier.tax_rate != null && <span className="tabular-nums text-foreground">· {Number(supplier.tax_rate)}% tax</span>}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
        </button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-lg p-2 text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Delete ${supplier.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{supplier.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Removes it from the supplier list. Existing delivery records that used this name are
                unaffected — they keep it as-is.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {expanded && (
        <div className="ml-2 mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="space-y-1">
            <div className={FIELD_LABEL}>Phone</div>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => onUpdateContact({ phone: phone.trim() || null })}
              placeholder="(555) 123-4567"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <div className={FIELD_LABEL}>Email</div>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => onUpdateContact({ email: email.trim() || null })}
              placeholder="orders@supplier.com"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <div className={FIELD_LABEL}>Sales tax rate (%)</div>
            <Input
              inputMode="decimal"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              onBlur={commitTaxRate}
              placeholder="Default rate"
              className="h-9 tabular-nums"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <div className={FIELD_LABEL}>Address</div>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => onUpdateContact({ address: address.trim() || null })}
              placeholder="123 Industrial Way, Springfield"
              className="h-9"
            />
          </div>
        </div>
      )}
    </div>
  );
}
