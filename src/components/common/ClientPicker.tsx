import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Client } from "@/lib/api";
import { useClientField, type ClientField, type NewClientDraft } from "@/hooks/use-client-field";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

/**
 * The one client picker, used everywhere a client is chosen (New
 * opportunity, New project, appointments, tasks, the quote builder's
 * "Change client", Communications):
 *
 * - `ClientCombobox` — a search-as-you-type field (name, email, phone)
 *   with the matches in a dropdown right under it. A pick shows as a chip
 *   (name + phone/email, × to clear). "+ New client" (in the dropdown, or
 *   the text button beside the label) expands a compact inline form
 *   instead of opening another screen.
 * - `useClientField` (src/hooks/use-client-field.ts) — its state. A new client is only a local draft until
 *   the caller's own submit runs `ensureClient()`, which checks for a
 *   likely duplicate (same phone or email), creates the client, and hands
 *   back its id — so e.g. "Create opportunity" creates the client first,
 *   then the opportunity, in one click, and nothing is created if the
 *   client insert fails.
 * - `ClientPickerDialog` — the same combobox in a single modal, for
 *   callers whose trigger can't hold an inline field (the quote builder's
 *   dark Client pill, the Communications log row).
 */

const emptyDraft = (name = ""): NewClientDraft => ({ name, phone: "", email: "", address: "" });

function contactLine(c: Client) {
  return [c.phone, c.email].filter(Boolean).join(" · ");
}

export function ClientCombobox({
  field,
  label = "Client",
  optional,
  autoFocus,
  alwaysOpen,
  onCreateAnyway,
  onPicked,
  className,
}: {
  field: ClientField;
  label?: string;
  /** Shows "(optional)" and a "No client" row. */
  optional?: boolean;
  autoFocus?: boolean;
  /** Keep the results list visible without focus (used inside the picker dialog). */
  alwaysOpen?: boolean;
  /** Duplicate prompt's "Create anyway". Should call field.acceptDuplicate() then re-submit. */
  onCreateAnyway?: () => void;
  /** An existing client (or "No client") was picked from the list or the duplicate prompt. */
  onPicked?: (clientId: string | null) => void;
  className?: string;
}) {
  const { clients, selectedClient, draft } = field;
  const inputId = useId();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    // Phone matches on digits, so "555 1234" finds "(555) 123-4567".
    const digits = q.replace(/\D/g, "");
    const list = q
      ? clients.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.email ?? "").toLowerCase().includes(q) ||
            (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits)),
        )
      : clients;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, q]);

  // Options, in display order. Typed text with no match → "Add '…' as new
  // client" leads the list; otherwise "+ New client" is always last.
  type Option = { kind: "client"; client: Client } | { kind: "new"; lead: boolean } | { kind: "none" };
  const noMatch = !!q && matches.length === 0;
  const options: Option[] = noMatch
    ? [{ kind: "new", lead: true }]
    : [
        ...(optional && !q ? [{ kind: "none" as const }] : []),
        ...matches.map((client) => ({ kind: "client" as const, client })),
        { kind: "new" as const, lead: false },
      ];

  const open = alwaysOpen || focused;
  useEffect(() => setActive(0), [q]);

  const startNew = (name: string) => {
    field.setDraft(emptyDraft(name));
    setQuery("");
    setFocused(false);
  };

  const choose = (opt: Option) => {
    if (opt.kind === "new") return startNew(query.trim());
    const id = opt.kind === "client" ? opt.client.id : null;
    field.setClientId(id);
    setQuery("");
    setFocused(false);
    inputRef.current?.blur();
    onPicked?.(id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocused(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape" && focused && !alwaysOpen) {
      // Close just the list, not the surrounding dialog.
      e.preventDefault();
      e.stopPropagation();
      setFocused(false);
    }
  };

  // On phones, lift the field to the top of the scrolling body so the
  // results list sits above the on-screen keyboard instead of under it.
  const onFocus = () => {
    setFocused(true);
    if (window.matchMedia("(max-width: 639px)").matches) {
      window.setTimeout(() => wrapRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
    }
  };

  const updateDraft = (patch: Partial<NewClientDraft>) => field.setDraft({ ...draft!, ...patch });

  return (
    <div ref={wrapRef} className={cn("scroll-mt-2 space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={draft ? undefined : inputId}>
          {label}
          {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
        </Label>
        {!draft && !selectedClient && (
          <button
            type="button"
            onClick={() => startNew(query.trim())}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> New client
          </button>
        )}
      </div>

      {selectedClient ? (
        <div className="flex min-h-11 items-center gap-3 rounded-md border border-input bg-muted/40 px-3 py-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {selectedClient.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{selectedClient.name}</div>
            {contactLine(selectedClient) && (
              <div className="truncate text-xs text-muted-foreground">{contactLine(selectedClient)}</div>
            )}
          </div>
          <button
            type="button"
            aria-label="Clear client"
            onClick={() => {
              field.setClientId(null);
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : draft ? (
        <div className="space-y-2.5 rounded-lg border border-primary/40 bg-primary/5 p-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground">
              <UserPlus className="h-3.5 w-3.5" /> New client
            </span>
            <button
              type="button"
              onClick={() => {
                field.setDraft(null);
                window.setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
            >
              Cancel
            </button>
          </div>
          <Input
            aria-label="Client name"
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            placeholder="Name"
            autoComplete="off"
            autoFocus
          />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Input
              aria-label="Phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={draft.phone}
              onChange={(e) => updateDraft({ phone: e.target.value })}
              placeholder="Phone"
            />
            <Input
              aria-label="Email"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              value={draft.email}
              onChange={(e) => updateDraft({ email: e.target.value })}
              placeholder="Email"
            />
          </div>
          <Input
            aria-label="Address"
            autoComplete="off"
            value={draft.address}
            onChange={(e) => updateDraft({ address: e.target.value })}
            placeholder="Address"
          />
          {/* Live, so a disabled Create button always has a visible reason. */}
          <p className={cn("text-xs", field.error && field.draftError ? "text-destructive" : "text-muted-foreground")}>
            {(draft.name.trim() || field.error) && field.draftError ? field.draftError : "Name plus a phone or email."}
          </p>
        </div>
      ) : (
        <div
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
          }}
        >
          <Input
            ref={inputRef}
            id={inputId}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFocused(true);
            }}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            placeholder="Search name, email or phone…"
            autoComplete="off"
            autoFocus={autoFocus}
            className="h-11"
          />
          {open && (
            // In the normal flow (not absolutely positioned) so a scrolling
            // dialog body can never clip it.
            <ul
              id={listId}
              role="listbox"
              className="mt-1.5 max-h-[min(18rem,40vh)] overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-sm animate-in fade-in-0 duration-150"
            >
              {options.map((opt, i) => (
                <li
                  key={opt.kind === "client" ? opt.client.id : `${opt.kind}-${i}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown, not click — keeps focus in the input so the
                  // blur handler doesn't close the list first.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(opt);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-sm",
                    i === active && "bg-muted",
                    opt.kind === "new" && "font-semibold text-primary",
                    opt.kind === "new" && !opt.lead && i > 0 && "mt-1 border-t border-hairline pt-2.5",
                  )}
                >
                  {opt.kind === "client" ? (
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">{opt.client.name}</div>
                      {contactLine(opt.client) && (
                        <div className="truncate text-xs text-muted-foreground">{contactLine(opt.client)}</div>
                      )}
                    </div>
                  ) : opt.kind === "none" ? (
                    <span className="text-muted-foreground">No client</span>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 shrink-0" />
                      <span className="truncate">{opt.lead ? `Add "${query.trim()}" as new client` : "New client"}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {field.duplicate && (
        <div className="space-y-2 rounded-lg bg-warning/15 p-3 text-sm text-warning animate-in fade-in-0 duration-150">
          <p className="font-semibold">
            Looks like {field.duplicate.name} already exists — use them instead?
          </p>
          {contactLine(field.duplicate) && <p className="text-xs text-warning/80">{contactLine(field.duplicate)}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="font-bold"
              onClick={() => {
                const existing = field.duplicate!;
                field.pickExisting(existing);
                onPicked?.(existing.id);
              }}
            >
              Use existing
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onCreateAnyway}>
              Create anyway
            </Button>
          </div>
        </div>
      )}
      {field.error && !field.draftError && <p className="text-sm font-medium text-destructive">{field.error}</p>}
    </div>
  );
}

/**
 * The combobox in its own modal — for triggers that can't hold an inline
 * field. Picking an existing client applies immediately; a new one is
 * created by the dialog's "Add client" button.
 */
function ClientPickerDialogInner({
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
  /** Shows a "No client" row in the list. */
  allowClear?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] max-w-md flex-col gap-0 p-0 top-[6dvh] translate-y-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2">
        {open && (
          <ClientPickerBody
            allowClear={allowClear}
            onDone={(id) => {
              onSelect(id);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Mounted only while open, so every open starts fresh.
function ClientPickerBody({
  allowClear,
  onDone,
  onCancel,
}: {
  allowClear?: boolean;
  onDone: (clientId: string | null) => void;
  onCancel: () => void;
}) {
  const field = useClientField();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const id = await field.ensureClient();
    setSaving(false);
    if (id !== undefined) onDone(id);
  };

  return (
    <>
      <DialogHeader className="border-b border-hairline px-5 py-4">
        <DialogTitle>{field.draft ? "New client" : "Pick a client"}</DialogTitle>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <ClientCombobox
          field={field}
          label="Client"
          optional={allowClear}
          autoFocus
          alwaysOpen
          // An existing pick (or "No client") is final — apply it straight away.
          onPicked={onDone}
          onCreateAnyway={() => {
            field.acceptDuplicate();
            void save();
          }}
        />
      </div>
      {field.draft && (
        <div className="flex gap-2 border-t border-hairline px-5 py-4">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1 font-bold" disabled={!field.hasClient || saving} onClick={save}>
            {saving ? "Adding…" : "Add client"}
          </Button>
        </div>
      )}
    </>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const ClientPickerDialog = withErrorBoundary(ClientPickerDialogInner, "ClientPickerDialog");
