import { useRef, useState, type ReactNode } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  ImagePlus,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import {
  getProject,
  listQuotes,
  listInvoices,
  listMaterials,
  listMaterialsSheets,
  listExpenses,
  listChangeOrders,
  listProjectEvents,
  quoteTotal,
  listProjectImages,
  addProjectImage,
  updateProjectImageCaption,
  deleteProjectImage,
  getSignedImageUrls,
  logProjectEvent,
  updateProject,
  pickHeadlineQuote,
  projectContractValue,
  approvedChangeOrderTotal,
  materialsCogs,
  type ProjectStatus,
  type ProjectImage,
} from "@/lib/api";
import {
  PROJECT_STATUS_META,
  PROJECT_STATUSES,
  projectStatusMeta,
  quoteStatusMeta,
} from "@/lib/statusMeta";
import { demoJobMeta } from "@/lib/demoData";

const expenseDate = (iso: string | null) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";

export function ProjectDetailView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project, isLoading, isError, error } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => getProject(id),
  });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes", { project: id }], queryFn: () => listQuotes(id) });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices", { project: id }], queryFn: () => listInvoices(id) });
  const { data: materials = [] } = useQuery({ queryKey: ["materials", { project: id }], queryFn: () => listMaterials(id) });
  const { data: materialsSheets = [] } = useQuery({
    queryKey: ["materials-sheets", { project: id }],
    queryFn: () => listMaterialsSheets(id),
  });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses", { project: id }], queryFn: () => listExpenses(id) });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", { project: id }],
    queryFn: () => listChangeOrders(id),
  });
  const { data: events = [] } = useQuery({ queryKey: ["project-events", id], queryFn: () => listProjectEvents(id) });

  const statusMutation = useMutation({
    mutationFn: (status: ProjectStatus) => updateProject(id, { status }),
    onSuccess: (_data, status) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      void logProjectEvent(id, "status_changed", `Status → ${projectStatusMeta(status).label}`);
      qc.invalidateQueries({ queryKey: ["project-events", id] });
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't update status", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading project…</p>;
  if (isError || !project)
    return <p className="text-destructive">Failed to load project: {(error as Error)?.message}</p>;

  const headlineQuote = pickHeadlineQuote(quotes);
  const contract = projectContractValue(quotes, changeOrders);
  const invoicedTotal = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const paidTotal = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const leftToBill = Math.max(0, contract - invoicedTotal);

  const totalMaterialsItems = materials.reduce((n, s) => n + s.materials_items.length, 0);
  const predictedCost = totalMaterialsItems > 0 ? materialsCogs(materials) : null;
  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const actualCost = expenses.length > 0 ? expensesTotal : null;
  const realCost = actualCost ?? predictedCost;
  const marginPct = contract > 0 && realCost != null ? Math.round(((contract - realCost) / contract) * 100) : null;
  const marginProfit = realCost != null ? contract - realCost : null;

  const meta = projectStatusMeta(project.status);
  const demo = demoJobMeta(project);
  const recentExpenses = [...expenses]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const materialsSummary =
    materials.length === 0
      ? "Not started"
      : materialsSheets.length > 1
        ? `${pluralize(materialsSheets.length, "sheet")} · ${formatCurrency(materialsCogs(materials))} cost`
        : `${pluralize(materials.length, "section")} · ${formatCurrency(materialsCogs(materials))} cost`;
  const quotesSummary =
    quotes.length === 0
      ? "Not started"
      : `${pluralize(quotes.length, "quote")}${headlineQuote ? ` · ${quoteStatusMeta(headlineQuote.status).label} · ${formatCurrency(quoteTotal(headlineQuote.quote_sections))}` : ""}`;
  const invoicesSummary =
    invoices.length === 0
      ? "None yet"
      : `${pluralize(invoices.length, "invoice")} · ${formatCurrency(invoicedTotal)}`;
  const expensesSummary =
    expenses.length === 0
      ? "None yet"
      : `${pluralize(expenses.length, "expense")} · ${formatCurrency(expensesTotal)}`;
  const approvedCOTotal = approvedChangeOrderTotal(changeOrders);
  const pendingCOCount = changeOrders.filter((co) => co.status === "pending").length;
  const changeOrdersSummary =
    changeOrders.length === 0
      ? "None yet"
      : `${approvedCOTotal > 0 ? "+" : ""}${formatCurrency(approvedCOTotal)} approved${pendingCOCount ? ` · ${pendingCOCount} pending` : ""}`;

  const statusSelect = (
    <Select value={project.status} onValueChange={(v) => statusMutation.mutate(v as ProjectStatus)}>
      <SelectTrigger className="h-9 w-40 rounded-[0.625rem] border-border bg-card text-sm font-semibold">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>{PROJECT_STATUS_META[s].label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="animate-fade-in space-y-5">
      <MobilePageHeader
        title={project.name}
        subtitle={`${project.client?.name ?? "No client"} · ${demo.crew}`}
        back={{ to: "/projects", label: "Projects" }}
        pills={<StatusPill meta={meta} className="!bg-white/20 !text-sidebar-foreground" />}
      />

      {/* Desktop header */}
      <div className="hidden md:block">
        <Link to="/projects" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[28px] font-bold tracking-tight text-foreground">{project.name}</h1>
              <StatusPill meta={meta} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {project.client?.name ?? "No client"} · {demo.crew}
            </p>
          </div>
          {statusSelect}
        </div>
      </div>
      <div className="md:hidden">{statusSelect}</div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Section nav */}
          <div className="grid gap-3 sm:grid-cols-2">
            <HubCard title="Materials sheet" summary={materialsSummary} onOpen={() => navigate(`/projects/${id}/materials`)} />
            <HubCard title="Quotes" summary={quotesSummary} onOpen={() => navigate(`/projects/${id}/quotes`)} />
            <HubCard title="Invoices" summary={invoicesSummary} onOpen={() => navigate(`/projects/${id}/invoices`)} />
            <HubCard title="Expenses" summary={expensesSummary} onOpen={() => navigate(`/projects/${id}/expenses`)} />
            <HubCard
              title="Change orders"
              summary={changeOrdersSummary}
              onOpen={() => navigate(`/projects/${id}/change-orders`)}
            />
          </div>

          {/* Profit summary (real) */}
          <ProfitSummaryCard
            quoted={contract || null}
            predictedCost={predictedCost}
            actualCost={actualCost}
          />

          {/* Costs to date — real logged expenses only */}
          <section className="card-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Costs to date</h3>
              <Link
                to={`/projects/${id}/expenses`}
                className="text-[13px] font-semibold text-primary"
              >
                {expenses.length ? "Manage" : "Add expense"}
              </Link>
            </div>
            <p className="mt-1 text-[28px] font-extrabold tracking-tight tabular-nums text-foreground">
              {formatCurrency(expensesTotal)}
            </p>
            {expenses.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No expenses logged yet.</p>
            ) : (
              <div className="mt-3">
                {recentExpenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 border-b border-hairline py-2 last:border-0"
                  >
                    <span className="min-w-0 truncate text-[13px] text-foreground">
                      {e.name || "Expense"}
                      {e.date && <span className="text-muted-subtle"> · {expenseDate(e.date)}</span>}
                    </span>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground">
                      {formatCurrency(Number(e.amount))}
                    </span>
                  </div>
                ))}
                {expenses.length > recentExpenses.length && (
                  <p className="pt-2 text-xs font-semibold text-muted-foreground">
                    +{expenses.length - recentExpenses.length} more
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">Money</h3>
            <div className="mt-2">
              <MoneyRow label="Contract" value={contract > 0 ? formatCurrency(contract) : "—"} />
              <MoneyRow label="Invoiced" value={formatCurrency(invoicedTotal)} />
              <MoneyRow label="Paid" value={formatCurrency(paidTotal)} />
              <MoneyRow label="Left to bill" value={formatCurrency(leftToBill)} strong />
            </div>
            {marginProfit != null && (
              <div className="mt-3 rounded-xl bg-primary/10 p-3">
                <div className="text-xs font-semibold text-success">
                  {actualCost != null ? "Actual" : "Projected"} margin
                </div>
                <div className="mt-0.5 text-2xl font-extrabold tracking-tight text-foreground">
                  {marginPct}% <span className="text-sm font-bold text-muted-foreground">· {formatCurrency(marginProfit)}</span>
                </div>
              </div>
            )}
          </section>

          {project.client && (
            <section
              role="button"
              tabIndex={0}
              onClick={() => project.client_id && navigate(`/clients/${project.client_id}/edit`)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && project.client_id) {
                  e.preventDefault();
                  navigate(`/clients/${project.client_id}/edit`);
                }
              }}
              className="card-surface group w-full cursor-pointer p-5 text-left transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Client</h3>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-2 text-sm font-bold text-foreground">{project.client.name}</p>
              <div className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
                {project.client.address && (
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{project.client.address}</span>
                  </p>
                )}
                {project.client.phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <a
                      href={`tel:${project.client.phone}`}
                      className="hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {project.client.phone}
                    </a>
                  </p>
                )}
                {project.client.email && (
                  <p className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <a
                      href={`mailto:${project.client.email}`}
                      className="hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {project.client.email}
                    </a>
                  </p>
                )}
              </div>
            </section>
          )}

          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">Activity</h3>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {events.map((e) => (
                  <li key={e.id}>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
                      {timeAgo(e.created_at)}
                    </div>
                    <div className="mt-0.5 text-[13px] text-foreground/80">{e.summary}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <ProjectImagesCard projectId={id} />
    </div>
  );
}

function profitColor(v: number): string {
  return v >= 0 ? "text-success" : "text-destructive";
}

function ProfitSummaryCard({
  quoted,
  predictedCost,
  actualCost,
}: {
  quoted: number | null;
  predictedCost: number | null;
  actualCost: number | null;
}) {
  const money = (v: number | null) => (v === null ? "—" : formatCurrency(v));
  const predictedProfit = quoted !== null && predictedCost !== null ? quoted - predictedCost : null;
  const actualProfit = quoted !== null && actualCost !== null ? quoted - actualCost : null;
  const predictedMargin = predictedProfit !== null && quoted ? (predictedProfit / quoted) * 100 : null;
  const actualMargin = actualProfit !== null && quoted ? (actualProfit / quoted) * 100 : null;

  return (
    <section className="card-surface space-y-4 p-5">
      <h3 className="text-base font-bold text-foreground">Profit summary</h3>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <Metric label="Quoted" value={money(quoted)} />
        <Metric label="Predicted cost" value={money(predictedCost)} />
        <Metric label="Actual cost" value={money(actualCost)} />
      </div>
      {(predictedProfit !== null || actualProfit !== null) && (
        <div className="grid grid-cols-1 gap-4 border-t border-hairline pt-3 sm:grid-cols-2">
          {predictedProfit !== null && (
            <div>
              <p className="text-sm text-muted-foreground">Predicted profit</p>
              <p className={cn("text-lg font-extrabold", profitColor(predictedProfit))}>
                {formatCurrency(predictedProfit)}
                {predictedMargin !== null && <span className="ml-1.5 text-sm font-bold">({predictedMargin.toFixed(0)}%)</span>}
              </p>
            </div>
          )}
          {actualProfit !== null && (
            <div>
              <p className="text-sm text-muted-foreground">Actual profit</p>
              <p className={cn("text-lg font-extrabold", profitColor(actualProfit))}>
                {formatCurrency(actualProfit)}
                {actualMargin !== null && <span className="ml-1.5 text-sm font-bold">({actualMargin.toFixed(0)}%)</span>}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-bold text-foreground">{value}</p>
    </div>
  );
}

function HubCard({ title, summary, onOpen }: { title: string; summary: ReactNode; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-surface group flex items-center justify-between gap-3 p-4 text-left transition-shadow hover:shadow-card-hover"
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/**
 * A project's photo gallery (0025) — progress photos, before/after, site
 * conditions. Full-width so the grid has room; unlike everything else on
 * this page, uploads/deletes/caption edits are real, immediate writes (no
 * draft+Save — there's nothing to "save" about a photo, it either uploaded
 * or it didn't).
 */
function ProjectImagesCard({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxImage, setLightboxImage] = useState<ProjectImage | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");

  const { data: images = [], isLoading } = useQuery({
    queryKey: ["project-images", projectId],
    queryFn: () => listProjectImages(projectId),
  });

  const paths = images.map((i) => i.storage_path);
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["project-image-urls", projectId, images.map((i) => i.id).join(",")],
    queryFn: () => getSignedImageUrls(paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["project-images", projectId] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const uploadMut = useMutation({
    mutationFn: async (files: File[]) => {
      for (let i = 0; i < files.length; i++) {
        await addProjectImage(projectId, files[i], { sort_order: images.length + i });
      }
    },
    onSuccess: invalidate,
    onError,
  });

  const captionMut = useMutation({
    mutationFn: ({ id, caption }: { id: string; caption: string | null }) =>
      updateProjectImageCaption(id, caption),
    onSuccess: invalidate,
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: (image: ProjectImage) => deleteProjectImage(image),
    onSuccess: () => {
      setLightboxImage(null);
      invalidate();
    },
    onError,
  });

  const openLightbox = (img: ProjectImage) => {
    setLightboxImage(img);
    setCaptionDraft(img.caption ?? "");
  };

  const saveCaption = () => {
    if (!lightboxImage) return;
    const trimmed = captionDraft.trim();
    if (trimmed !== (lightboxImage.caption ?? "")) {
      captionMut.mutate({ id: lightboxImage.id, caption: trimmed || null });
    }
  };

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Project Images</h3>
        {images.length > 0 && (
          <span className="text-[13px] font-semibold text-muted-foreground">
            {pluralize(images.length, "photo")}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : images.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No photos yet — add progress photos, before/after, or site conditions.
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => openLightbox(img)}
            className="group aspect-square overflow-hidden rounded-xl bg-muted"
            aria-label={img.caption || "View photo"}
          >
            {signedUrls[img.storage_path] ? (
              <img
                src={signedUrls[img.storage_path]}
                alt={img.caption ?? ""}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-subtle" />
              </div>
            )}
          </button>
        ))}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMut.isPending}
          className="flex aspect-square items-center justify-center rounded-xl border-[1.5px] border-dashed border-border text-muted-subtle transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Add photos"
        >
          {uploadMut.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) uploadMut.mutate(files);
          }}
        />
      </div>

      <Dialog
        open={!!lightboxImage}
        onOpenChange={(open) => {
          if (!open) {
            saveCaption();
            setLightboxImage(null);
          }
        }}
      >
        <DialogContent className="max-w-lg gap-3 p-4">
          <DialogTitle className="text-sm font-bold text-foreground">Photo</DialogTitle>
          {lightboxImage && (
            <>
              {signedUrls[lightboxImage.storage_path] ? (
                <img
                  src={signedUrls[lightboxImage.storage_path]}
                  alt=""
                  className="max-h-[60vh] w-full rounded-xl object-contain"
                />
              ) : (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-subtle" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="image-caption" className="text-xs font-semibold text-muted-foreground">
                  Caption
                </Label>
                <Input
                  id="image-caption"
                  value={captionDraft}
                  onChange={(e) => setCaptionDraft(e.target.value)}
                  onBlur={saveCaption}
                  placeholder="Add a caption…"
                />
              </div>
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => deleteMut.mutate(lightboxImage)}
                disabled={deleteMut.isPending}
              >
                <Trash2 className="h-4 w-4" />
                {deleteMut.isPending ? "Removing…" : "Delete photo"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
