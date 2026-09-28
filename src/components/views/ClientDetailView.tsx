import { useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Trash2,
  ImagePlus,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, pluralize } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import {
  getClient,
  updateClient,
  setClientNoReviewRequests,
  listProjectsForClient,
  listQuotesForClient,
  listInvoicesForClient,
  listPaymentsForClient,
  listOpportunitiesForClient,
  clientLifetimeRevenue,
  clientOutstandingBalance,
  quoteTotal,
  listClientContacts,
  addClientContact,
  deleteClientContact,
  listClientAddresses,
  addClientAddress,
  deleteClientAddress,
  listClientFiles,
  addClientFile,
  deleteClientFile,
  getSignedImageUrls,
  listActivities,
  logActivity,
  listTasksForClient,
  setTaskCompleted,
  listAppointmentsForClient,
  type ActivityKind,
  type Client,
} from "@/lib/api";
import { inviteClientToHub } from "@/lib/portalApi";
import { clientStatusMeta, projectStatusMeta, quoteStatusMeta, invoiceStatusMeta, opportunityStageMeta } from "@/lib/statusMeta";
import { TaskRow, CreateTaskDialog } from "@/components/views/TasksView";
import { AppointmentRow, CreateAppointmentDialog } from "@/components/views/AppointmentsView";
import { BackLink } from "@/components/common/BackLink";
import { effectiveInvoiceStatus } from "@/lib/financials";

/** Kinds you can log by hand. */
const ACTIVITY_KIND_LABEL: Partial<Record<ActivityKind, string>> = {
  note: "Note",
  text: "Text",
  email: "Email",
  other: "Other",
};
/** Labels for automatic timeline entries too (quote activity, 0117). */
const ACTIVITY_DISPLAY_LABEL: Partial<Record<ActivityKind, string>> = {
  ...ACTIVITY_KIND_LABEL,
  quote_viewed: "Quote viewed",
  quote_selection_changed: "Selections",
  quote_optional_changed: "Optional items",
};

export function ClientDetailView() {
  const { clientId = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: client, isLoading, isError, error } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClient(clientId),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["client-projects", clientId],
    queryFn: () => listProjectsForClient(clientId),
  });
  const { data: quotes = [] } = useQuery({
    queryKey: ["client-quotes", clientId],
    queryFn: () => listQuotesForClient(clientId),
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["client-invoices", clientId],
    queryFn: () => listInvoicesForClient(clientId),
  });
  const { data: clientPayments = [] } = useQuery({
    queryKey: ["payments", { client: clientId }],
    queryFn: () => listPaymentsForClient(clientId),
    enabled: !!clientId,
  });
  const { data: opportunities = [] } = useQuery({
    queryKey: ["client-opportunities", clientId],
    queryFn: () => listOpportunitiesForClient(clientId),
  });

  const [tagInput, setTagInput] = useState("");
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  const updateMut = useMutation({
    mutationFn: (patch: Parameters<typeof updateClient>[1]) => updateClient(clientId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", clientId] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  // Review requests (0122) — "Don't ask for reviews".
  const noReviewsMut = useMutation({
    mutationFn: (v: boolean) => setClientNoReviewRequests(clientId, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["review-requests"] });
      qc.invalidateQueries({ queryKey: ["review-request"] });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading client…</p>;
  if (isError || !client)
    return <p className="text-destructive">Failed to load client: {(error as Error)?.message}</p>;

  const meta = clientStatusMeta(client.status);
  const lifetimeRevenue = clientLifetimeRevenue(clientPayments);
  const outstandingBalance = clientOutstandingBalance(invoices);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || client.tags.includes(t)) {
      setTagInput("");
      return;
    }
    updateMut.mutate({ tags: [...client.tags, t] });
    setTagInput("");
  };
  const removeTag = (t: string) => updateMut.mutate({ tags: client.tags.filter((x) => x !== t) });

  const saveNotes = () => {
    if (notesDraft === null || notesDraft === (client.internal_notes ?? "")) {
      setNotesDraft(null);
      return;
    }
    updateMut.mutate({ internal_notes: notesDraft.trim() || null });
    setNotesDraft(null);
  };

  return (
    <div className="animate-fade-in space-y-5">
      <MobilePageHeader
        title={client.name}
        subtitle={[client.email, client.phone].filter(Boolean).join(" · ") || "No contact info"}
        back={{ to: "/clients", label: "Clients" }}
        pills={<StatusPill meta={meta} className="!bg-white/20 !text-sidebar-foreground" />}
      />

      <div className="hidden md:block">
        <BackLink to="/clients" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">Clients</BackLink>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[28px] font-bold tracking-tight text-foreground">{client.name}</h1>
              <StatusPill meta={meta} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {[client.email, client.phone].filter(Boolean).join(" · ") || "No contact info"}
            </p>
          </div>
          <Link to={`/clients/${clientId}/edit`}>
            <Button variant="outline">Edit</Button>
          </Link>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2">
        {client.tags.map((t) => (
          <span
            key={t}
            className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
          >
            {t}
            <button type="button" onClick={() => removeTag(t)} aria-label={`Remove tag ${t}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder="+ Add tag"
          className="h-7 w-28 rounded-full border-dashed text-xs"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <LinkedRecordsCard
            title="Opportunities"
            emptyLabel="No opportunities yet."
            items={opportunities.map((o) => ({
              id: o.id,
              to: `/pipeline/${o.id}`,
              label: o.title,
              pill: opportunityStageMeta(o.stage),
            }))}
          />
          <LinkedRecordsCard
            title="Projects"
            emptyLabel="No projects yet."
            items={projects.map((p) => ({
              id: p.id,
              to: `/projects/${p.id}`,
              label: p.name,
              pill: projectStatusMeta(p.status),
            }))}
          />
          <LinkedRecordsCard
            title="Quotes"
            emptyLabel="No quotes yet."
            items={quotes.map((q) => ({
              id: q.id,
              to: `/quotes/${q.id}`,
              label: formatCurrency(quoteTotal(q.quote_sections)),
              pill: quoteStatusMeta(q.status),
            }))}
          />
          <LinkedRecordsCard
            title="Invoices"
            emptyLabel="No invoices yet."
            items={invoices.map((i) => ({
              id: i.id,
              to: `/invoices/${i.id}`,
              label: i.invoice_number ?? formatCurrency(Number(i.amount)),
              pill: invoiceStatusMeta(effectiveInvoiceStatus(i), i.amount_paid),
            }))}
          />

          <ClientFilesCard clientId={clientId} />
          <ActivityCard clientId={clientId} />
        </div>

        <div className="space-y-5">
          <ClientAppointmentsCard clientId={clientId} />
          <ClientTasksCard clientId={clientId} />

          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">Money</h3>
            <div className="mt-2">
              <MoneyRow label="Lifetime revenue" value={formatCurrency(lifetimeRevenue)} strong />
              <MoneyRow label="Outstanding balance" value={formatCurrency(outstandingBalance)} />
            </div>
          </section>

          <section className="card-surface space-y-2 p-5 text-[13px] text-muted-foreground">
            <h3 className="text-base font-bold text-foreground">Contact</h3>
            <p className="flex items-center gap-2 pt-1">
              <Mail className="h-3.5 w-3.5 shrink-0" /> {client.email ?? "—"}
            </p>
            <p className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 shrink-0" /> {client.phone ?? "—"}
            </p>
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {client.address ?? "—"}
            </p>
            {client.lead_source && (
              <p className="pt-1 text-xs text-muted-subtle">Source: {client.lead_source}</p>
            )}
          </section>

          <ClientHubCard client={client} />

          <section className="card-surface p-5">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-bold text-foreground">Don't ask for reviews</span>
                <span className="block text-xs text-muted-foreground">No review prompts or Client Hub review card for this client</span>
              </span>
              <Switch
                checked={!!client.no_review_requests}
                disabled={noReviewsMut.isPending}
                onCheckedChange={(v) => noReviewsMut.mutate(v)}
              />
            </label>
          </section>

          <ContactsCard clientId={clientId} />
          <AddressesCard clientId={clientId} />

          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">Internal notes</h3>
            <Textarea
              value={notesDraft ?? client.internal_notes ?? ""}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={saveNotes}
              placeholder="Anything the team should know about this customer…"
              className="mt-2"
              rows={4}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LinkedRecordsCard({
  title,
  emptyLabel,
  items,
}: {
  title: string;
  emptyLabel: string;
  items: { id: string; to: string; label: string; pill: { label: string; badge: string } }[];
}) {
  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        {items.length > 0 && (
          <span className="text-[13px] font-semibold text-muted-foreground">{pluralize(items.length, "item")}</span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="mt-3 divide-y divide-hairline">
          {items.map((it) => (
            <Link
              key={it.id}
              to={it.to}
              className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
            >
              <span className="font-semibold text-foreground">{it.label}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className={it.pill.badge}>{it.pill.label}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-subtle" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** Contractor-facing hub status + invite control (Client Hub, Phase 1).
 * "invited"/"active" are derived purely from the two timestamp columns —
 * no separate status enum to keep in sync. Sending an invite/resend both
 * go through the same mutation: the magic-link email via portalSupabase
 * (never the contractor's own session), then stamping portal_invited_at
 * through the ordinary authenticated clients update. */
function ClientHubCard({ client }: { client: Client }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const inviteMut = useMutation({
    mutationFn: async () => {
      if (!client.email) throw new Error("Add an email address first.");
      await inviteClientToHub(client.email);
      await updateClient(client.id, { portal_invited_at: new Date().toISOString() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", client.id] });
      toast({ title: client.portal_invited_at ? "Link resent" : "Invite sent" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const status: "active" | "invited" | "never" = client.portal_last_sign_in_at
    ? "active"
    : client.portal_invited_at
      ? "invited"
      : "never";

  return (
    <section className="card-surface p-5">
      <h3 className="text-base font-bold text-foreground">Client hub</h3>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-foreground">
            {status === "active" ? "Active" : status === "invited" ? "Invited" : "Never signed in"}
          </p>
          {client.portal_last_sign_in_at ? (
            <p className="text-xs text-muted-subtle">Last sign-in {timeAgo(client.portal_last_sign_in_at)}</p>
          ) : client.portal_invited_at ? (
            <p className="text-xs text-muted-subtle">Invited {timeAgo(client.portal_invited_at)}</p>
          ) : (
            <p className="text-xs text-muted-subtle">Hasn't been invited yet</p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={!client.email || inviteMut.isPending}
          onClick={() => inviteMut.mutate()}
        >
          <Send className="h-3.5 w-3.5" />
          {inviteMut.isPending ? "Sending…" : status === "never" ? "Invite" : "Resend link"}
        </Button>
      </div>
      {!client.email && (
        <p className="mt-2 text-xs text-muted-subtle">Add an email address above to invite this client.</p>
      )}
    </section>
  );
}

function ContactsCard({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const { data: contacts = [] } = useQuery({
    queryKey: ["client-contacts", clientId],
    queryFn: () => listClientContacts(clientId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["client-contacts", clientId] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const addMut = useMutation({
    mutationFn: () => addClientContact(clientId, { name: name.trim(), role: role.trim() || null, phone: phone.trim() || null, email: email.trim() || null }),
    onSuccess: () => {
      invalidate();
      setAdding(false);
      setName("");
      setRole("");
      setPhone("");
      setEmail("");
    },
    onError,
  });
  const deleteMut = useMutation({ mutationFn: deleteClientContact, onSuccess: invalidate, onError });

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Contacts</h3>
        <button type="button" onClick={() => setAdding((a) => !a)} className="text-xs font-bold text-primary hover:underline">
          + Add
        </button>
      </div>
      {contacts.length > 0 && (
        <ul className="mt-2 space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2 text-sm">
              <div>
                <div className="font-semibold text-foreground">
                  {c.name} {c.role && <span className="font-normal text-muted-subtle">· {c.role}</span>}
                </div>
                <div className="text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>
              </div>
              <button type="button" onClick={() => deleteMut.mutate(c.id)} aria-label="Remove contact" className="text-muted-subtle hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="mt-3 space-y-2 rounded-lg border border-border p-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (optional)" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
          <Button
            className="w-full"
            size="sm"
            disabled={!name.trim() || addMut.isPending}
            onClick={() => addMut.mutate()}
          >
            {addMut.isPending ? "Adding…" : "Add contact"}
          </Button>
        </div>
      )}
    </section>
  );
}

function AddressesCard({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");

  const { data: addresses = [] } = useQuery({
    queryKey: ["client-addresses", clientId],
    queryFn: () => listClientAddresses(clientId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["client-addresses", clientId] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const addMut = useMutation({
    mutationFn: () => addClientAddress(clientId, { label: label.trim() || null, address: address.trim() }),
    onSuccess: () => {
      invalidate();
      setAdding(false);
      setLabel("");
      setAddress("");
    },
    onError,
  });
  const deleteMut = useMutation({ mutationFn: deleteClientAddress, onSuccess: invalidate, onError });

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Property addresses</h3>
        <button type="button" onClick={() => setAdding((a) => !a)} className="text-xs font-bold text-primary hover:underline">
          + Add
        </button>
      </div>
      {addresses.length > 0 && (
        <ul className="mt-2 space-y-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 text-sm">
              <div>
                {a.label && <div className="text-xs font-bold uppercase tracking-wide text-muted-subtle">{a.label}</div>}
                <div className="text-foreground">{a.address}</div>
              </div>
              <button type="button" onClick={() => deleteMut.mutate(a.id)} aria-label="Remove address" className="text-muted-subtle hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="mt-3 space-y-2 rounded-lg border border-border p-3">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Rental property)" />
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" />
          <Button
            className="w-full"
            size="sm"
            disabled={!address.trim() || addMut.isPending}
            onClick={() => addMut.mutate()}
          >
            {addMut.isPending ? "Adding…" : "Add address"}
          </Button>
        </div>
      )}
    </section>
  );
}

function ClientFilesCard({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: files = [] } = useQuery({
    queryKey: ["client-files", clientId],
    queryFn: () => listClientFiles(clientId),
  });
  const paths = files.map((f) => f.storage_path);
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["client-file-urls", clientId, files.map((f) => f.id).join(",")],
    queryFn: () => getSignedImageUrls(paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["client-files", clientId] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const uploadMut = useMutation({
    mutationFn: async (uploadFiles: File[]) => {
      for (let i = 0; i < uploadFiles.length; i++) {
        await addClientFile(clientId, uploadFiles[i], { sort_order: files.length + i });
      }
    },
    onSuccess: invalidate,
    onError,
  });
  const deleteMut = useMutation({ mutationFn: deleteClientFile, onSuccess: invalidate, onError });

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Files &amp; photos</h3>
        {files.length > 0 && <span className="text-[13px] font-semibold text-muted-foreground">{pluralize(files.length, "file")}</span>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
        {files.map((f) => (
          <div key={f.id} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
            {signedUrls[f.storage_path] ? (
              <img src={signedUrls[f.storage_path]} alt={f.name ?? ""} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-subtle" />
              </div>
            )}
            <button
              type="button"
              onClick={() => deleteMut.mutate(f)}
              aria-label="Delete file"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMut.isPending}
          className="flex aspect-square items-center justify-center rounded-xl border-[1.5px] border-dashed border-border text-muted-subtle transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Add files"
        >
          {uploadMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
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
            if (picked.length) uploadMut.mutate(picked);
          }}
        />
      </div>
    </section>
  );
}

function ActivityCard({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState<ActivityKind>("note");
  const [body, setBody] = useState("");

  const { data: activities = [] } = useQuery({
    queryKey: ["client-activities", clientId],
    queryFn: () => listActivities(clientId),
  });

  const logMut = useMutation({
    mutationFn: () => logActivity(clientId, kind, body.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-activities", clientId] });
      setBody("");
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <section className="card-surface p-5">
      <h3 className="text-base font-bold text-foreground">Activity</h3>

      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as ActivityKind)}>
            <SelectTrigger className="w-32 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ACTIVITY_KIND_LABEL) as ActivityKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {ACTIVITY_KIND_LABEL[k] ?? k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Log a note, text, or email…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && body.trim()) logMut.mutate();
            }}
          />
        </div>
        <Button size="sm" disabled={!body.trim() || logMut.isPending} onClick={() => logMut.mutate()}>
          {logMut.isPending ? "Logging…" : "Log activity"}
        </Button>
      </div>

      {activities.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No activity logged yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {activities.map((a) => (
            <li key={a.id} className="border-b border-hairline pb-3 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-subtle">
                  {ACTIVITY_DISPLAY_LABEL[a.kind as ActivityKind] ?? a.kind}
                </span>
                <span className="text-[11px] text-muted-subtle">{timeAgo(a.created_at)}</span>
              </div>
              <p className="mt-0.5 text-[13px] text-foreground/80">{a.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClientAppointmentsCard({ clientId }: { clientId: string }) {
  const [addOpen, setAddOpen] = useState(false);

  const { data: appointments = [] } = useQuery({
    queryKey: ["client-appointments", clientId],
    queryFn: () => listAppointmentsForClient(clientId),
  });

  // Completed appointments stay on the card (with their Completed badge),
  // below the scheduled ones — completing one never makes it vanish.
  // Cancelled / no-show ones are still left off.
  const shown = [
    ...appointments.filter((a) => a.status === "scheduled"),
    ...appointments.filter((a) => a.status === "completed"),
  ];

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Appointments</h3>
        <button type="button" onClick={() => setAddOpen(true)} className="text-xs font-bold text-primary hover:underline">
          + Add
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No appointments yet.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {shown.map((a) => (
            <AppointmentRow key={a.id} appointment={a} />
          ))}
        </div>
      )}
      <CreateAppointmentDialog open={addOpen} onOpenChange={setAddOpen} defaultClientId={clientId} />
    </section>
  );
}

function ClientTasksCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);

  const { data: tasks = [] } = useQuery({
    queryKey: ["client-tasks", clientId],
    queryFn: () => listTasksForClient(clientId),
  });

  const completeMut = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => setTaskCompleted(id, completed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-tasks", clientId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const open = tasks.filter((t) => !t.completed);

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Tasks</h3>
        <button type="button" onClick={() => setAddOpen(true)} className="text-xs font-bold text-primary hover:underline">
          + Add
        </button>
      </div>
      {open.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No open tasks.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {open.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={(v) => completeMut.mutate({ id: t.id, completed: v })} />
          ))}
        </div>
      )}
      <CreateTaskDialog open={addOpen} onOpenChange={setAddOpen} defaultClientId={clientId} />
    </section>
  );
}
