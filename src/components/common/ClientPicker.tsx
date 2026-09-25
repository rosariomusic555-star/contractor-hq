import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { ResponsiveDialog } from "@/components/responsive/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  listClients,
  createClient,
  findPossibleDuplicates,
  type Client,
  type PossibleDuplicate,
} from "@/lib/api";

/**
 * The reusable "pick a client" picker (CRM Phase 1, section 10) — search
 * existing customers, create a new one inline without leaving the
 * calling screen, and warn (never auto-merge) on likely duplicates.
 * Generalizes the one-off sentinel-based inline-create pattern that used
 * to live only in NewProjectView.tsx.
 *
 * Controlled like the app's other dialogs (LinkMaterialsSheetDialog,
 * SmartSectionDialog): the caller owns its own trigger UI/open state
 * (each existing call site has genuinely different trigger styling — a
 * plain Select here, a dark pill there) and just renders this dialog
 * alongside it.
 */
export function ClientPickerDialog({
  open,
  onOpenChange,
  onSelect,
  allowClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen (existing or newly-created) client's id, or
   * null if `allowClear` and the user picked "No client". */
  onSelect: (clientId: string | null) => void;
  /** Shows a "No client" row above the search results. */
  allowClear?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[]>([]);

  const resetCreate = () => {
    setCreating(false);
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setNewAddress("");
    setDuplicates([]);
  };

  // Fresh state every time the dialog opens/closes, not just on unmount.
  useEffect(() => {
    if (!open) {
      setSearch("");
      resetCreate();
    }
  }, [open]);

  const createMut = useMutation({
    mutationFn: () =>
      createClient({
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        address: newAddress.trim(),
      }),
    onSuccess: (client) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      onSelect(client.id);
      onOpenChange(false);
      toast({ title: "Client created" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const filtered = clients.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").includes(search.trim())
    );
  });

  // First "Create" click with an unresolved duplicate just shows the
  // warning; a second click (duplicates already shown, unchanged)
  // proceeds — an explicit override, never an automatic merge.
  const handleCreateClick = () => {
    if (duplicates.length === 0) {
      const found = findPossibleDuplicates({ name: newName, email: newEmail, phone: newPhone }, clients);
      if (found.length > 0) {
        setDuplicates(found);
        return;
      }
    }
    createMut.mutate();
  };

  return (
    // A bottom sheet on phones, a dialog on desktop.
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={creating ? "New client" : "Pick a client"}
      desktopClassName="max-w-sm gap-4"
    >

        {!creating ? (
          <div className="space-y-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone…"
              autoFocus
            />
            {allowClear && (
              <button
                type="button"
                onClick={() => {
                  onSelect(null);
                  onOpenChange(false);
                }}
                className="w-full rounded-xl border border-dashed border-border p-3 text-left text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                No client
              </button>
            )}
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No matches.</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onSelect(c.id);
                      onOpenChange(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 pl-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{c.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact info"}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
                  </button>
                ))
              )}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
              + Create new client
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setDuplicates([]);
              }}
              placeholder="Name"
              autoFocus
            />
            <Input
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
                setDuplicates([]);
              }}
              placeholder="Email"
              type="email"
            />
            <Input
              value={newPhone}
              onChange={(e) => {
                setNewPhone(e.target.value);
                setDuplicates([]);
              }}
              placeholder="Phone"
              type="tel"
              inputMode="tel"
            />
            <Input
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="Address"
            />

            {duplicates.length > 0 && (
              <div className="space-y-2 rounded-lg bg-warning/15 p-3 text-sm text-warning">
                <p className="font-semibold">This might already exist:</p>
                {duplicates.map((d) => (
                  <button
                    key={d.client.id}
                    type="button"
                    onClick={() => {
                      onSelect(d.client.id);
                      onOpenChange(false);
                    }}
                    className="block text-left underline underline-offset-2"
                  >
                    {d.client.name} ({d.reason} match)
                  </button>
                ))}
                <p className="text-xs text-warning/80">Or press Create again to add a new record anyway.</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={resetCreate}>
                Cancel
              </Button>
              <Button
                className="flex-1 font-bold"
                disabled={!newName.trim() || createMut.isPending}
                onClick={handleCreateClick}
              >
                {createMut.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        )}
    </ResponsiveDialog>
  );
}
