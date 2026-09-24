import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageSquare, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterPills, FilterSegment, type FilterOption } from "@/components/common/FilterControls";
import { ClientPickerDialog } from "@/components/common/ClientPicker";
import { useToast } from "@/hooks/use-toast";
import { pluralize } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { listCommunications, listClients, logActivity, type Activity, type ActivityKind } from "@/lib/api";

type Filter = "all" | "text" | "email" | "note";

const KIND_LABEL: Record<Filter, string> = { all: "All", text: "Texts", email: "Emails", note: "Notes" };
const KIND_ICON: Record<"text" | "email" | "note", typeof Mail> = {
  text: MessageSquare,
  email: Mail,
  note: StickyNote,
};

/**
 * CRM Phase 6's "Communication Center" — every manually-logged note/
 * text/email across every customer in one place, newest first, so
 * "did anyone follow up with this person" doesn't require opening each
 * customer one at a time. Manual log only, same as the per-customer
 * composer (Phase 1) — no live email/SMS sending, per the ask.
 */
export function CommunicationsView() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data: communications = [], isLoading } = useQuery({
    queryKey: ["communications"],
    queryFn: listCommunications,
  });

  const counts = {
    text: communications.filter((c) => c.kind === "text").length,
    email: communications.filter((c) => c.kind === "email").length,
    note: communications.filter((c) => c.kind === "note").length,
  };
  const filtered = filter === "all" ? communications : communications.filter((c) => c.kind === filter);

  const options: FilterOption<Filter>[] = [
    { value: "all", label: "All", count: communications.length },
    { value: "text", label: "Texts", count: counts.text },
    { value: "email", label: "Emails", count: counts.email },
    { value: "note", label: "Notes", count: counts.note },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Communications</h1>
        <p className="mt-0.5 text-muted-foreground">{pluralize(communications.length, "logged communication")}</p>
      </div>

      <LogCommunicationCard />

      <FilterSegment className="hidden md:inline-flex" options={options} value={filter} onChange={setFilter} />
      <FilterPills className="md:hidden" options={options} value={filter} onChange={setFilter} />

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <div className="space-y-2">
        {filtered.length === 0 && !isLoading && (
          <div className="card-surface p-10 text-center text-muted-foreground">Nothing here.</div>
        )}
        {filtered.map((c) => (
          <CommunicationRow key={c.id} communication={c} />
        ))}
      </div>
    </div>
  );
}

function CommunicationRow({ communication }: { communication: Activity }) {
  const kind = communication.kind as "text" | "email" | "note";
  const Icon = KIND_ICON[kind] ?? StickyNote;
  return (
    <Link
      to={communication.client_id ? `/clients/${communication.client_id}` : "#"}
      className="flex items-start gap-3 card-surface p-3.5 transition-colors hover:bg-muted/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-foreground">{communication.client?.name ?? "Unknown customer"}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {KIND_LABEL[kind] ?? kind}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{communication.summary}</p>
      </div>
      <span className="shrink-0 text-[11px] text-muted-subtle">{timeAgo(communication.created_at)}</span>
    </Link>
  );
}

function LogCommunicationCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [kind, setKind] = useState<Exclude<Filter, "all">>("note");
  const [body, setBody] = useState("");

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  const logMut = useMutation({
    mutationFn: () => logActivity(clientId!, kind as ActivityKind, body.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communications"] });
      qc.invalidateQueries({ queryKey: ["client-activities", clientId] });
      setBody("");
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <section className="card-surface space-y-2 p-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex h-10 w-48 shrink-0 items-center justify-between rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/50"
        >
          <span className={selectedClient ? "truncate text-foreground" : "text-muted-foreground"}>{selectedClient ? selectedClient.name : "Pick a customer"}</span>
        </button>
        <Select value={kind} onValueChange={(v) => setKind(v as Exclude<Filter, "all">)}>
          <SelectTrigger className="w-32 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="note">Note</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What happened?"
          className="min-w-[200px] flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && clientId && body.trim()) logMut.mutate();
          }}
        />
        <Button disabled={!clientId || !body.trim() || logMut.isPending} onClick={() => logMut.mutate()}>
          {logMut.isPending ? "Logging…" : "Log"}
        </Button>
      </div>
      <ClientPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onSelect={setClientId} />
    </section>
  );
}
