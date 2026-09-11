import { Fragment, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ImagePlus, Loader2, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { StatusPill } from "@/components/common/StatusPill";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, pluralize } from "@/lib/utils";
import {
  getProject,
  listChangeOrders,
  createChangeOrder,
  updateChangeOrder,
  deleteChangeOrder,
  approvedChangeOrderTotal,
  logProjectEvent,
  listChangeOrderImages,
  addChangeOrderImage,
  deleteChangeOrderImage,
  getSignedImageUrls,
  CHANGE_ORDER_REASONS,
  type ChangeOrder,
  type ChangeOrderImage,
  type ChangeOrderReason,
  type ChangeOrderStatus,
} from "@/lib/api";
import { changeOrderStatusMeta } from "@/lib/statusMeta";

const NONE = "__none__";

const reasonLabel = (reason: ChangeOrderReason | null) =>
  reason ? (CHANGE_ORDER_REASONS.find((r) => r.value === reason)?.label ?? reason) : "—";

const signedCurrency = (n: number) => (n > 0 ? `+${formatCurrency(n)}` : formatCurrency(n));
const amountColor = (n: number) => (n > 0 ? "text-success" : n < 0 ? "text-destructive" : "text-foreground");

export function ProjectChangeOrdersView() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState<ChangeOrderReason | null>(null);
  const [amount, setAmount] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const {
    data: changeOrders = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["change-orders", { project: id }],
    queryFn: () => listChangeOrders(id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["change-orders", { project: id }] });
    qc.invalidateQueries({ queryKey: ["change-orders"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["projects", id] });
    qc.invalidateQueries({ queryKey: ["project-events", id] });
  };
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const addMut = useMutation({
    mutationFn: () =>
      createChangeOrder({
        project_id: id,
        title: title.trim(),
        description: description.trim() || null,
        reason,
        amount: parseFloat(amount) || 0,
      }),
    onSuccess: (co) => {
      invalidate();
      void logProjectEvent(id, "change_order_created", `Change order: ${co.title} · ${signedCurrency(Number(co.amount))}`);
      setTitle("");
      setDescription("");
      setReason(null);
      setAmount("");
    },
    onError,
  });

  const statusMut = useMutation({
    mutationFn: ({ co, status }: { co: ChangeOrder; status: ChangeOrderStatus }) =>
      updateChangeOrder(co.id, { status, approved_at: status === "approved" ? new Date().toISOString() : null }),
    onSuccess: (_data, { co, status }) => {
      invalidate();
      if (status === "approved") {
        void logProjectEvent(id, "change_order_approved", `Change order approved: ${co.title} · ${signedCurrency(Number(co.amount))}`);
      } else if (status === "rejected") {
        void logProjectEvent(id, "change_order_rejected", `Change order rejected: ${co.title}`);
      }
    },
    onError,
  });

  const editMut = useMutation({
    mutationFn: (patch: { id: string; title: string; description: string | null; reason: ChangeOrderReason | null; amount: number }) =>
      updateChangeOrder(patch.id, {
        title: patch.title,
        description: patch.description,
        reason: patch.reason,
        amount: patch.amount,
      }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: (coId: string) => deleteChangeOrder(coId),
    onSuccess: invalidate,
    onError,
  });

  const canSave = title.trim().length > 0 && amount.trim().length > 0 && !Number.isNaN(parseFloat(amount));
  const approvedTotal = approvedChangeOrderTotal(changeOrders);
  const pendingCount = changeOrders.filter((co) => co.status === "pending").length;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Link
        to={`/projects/${id}`}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to project
      </Link>

      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Change orders</h1>
        <p className="text-muted-foreground mt-1">{project?.name ?? " "}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="font-bold text-foreground">
          Approved total: <span className={amountColor(approvedTotal)}>{signedCurrency(approvedTotal)}</span>
        </span>
        {pendingCount > 0 && (
          <span className="text-muted-foreground">{pluralize(pendingCount, "change order")} pending</span>
        )}
      </div>

      <div className="stat-card space-y-3">
        <h2 className="font-medium text-foreground">Add change order</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="co-title">Title</Label>
            <Input
              id="co-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Add retaining wall extension"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-amount">Amount</Label>
            <Input
              id="co-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1200 or -500"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-reason">Reason (optional)</Label>
            <Select value={reason ?? NONE} onValueChange={(v) => setReason(v === NONE ? null : (v as ChangeOrderReason))}>
              <SelectTrigger id="co-reason" aria-label="Reason">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {CHANGE_ORDER_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-description">Description (optional)</Label>
            <Textarea
              id="co-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details for the record…"
              rows={2}
            />
          </div>
        </div>
        <Button onClick={() => addMut.mutate()} disabled={!canSave || addMut.isPending} className="font-bold">
          {addMut.isPending ? "Saving…" : "Add change order"}
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading change orders…</p>}
      {isError && <p className="text-destructive">Failed to load change orders: {(error as Error).message}</p>}

      {!isLoading && !isError && changeOrders.length === 0 && (
        <div className="stat-card text-center py-12">
          <p className="text-muted-foreground">No change orders yet. Add the first one above.</p>
        </div>
      )}

      {!isLoading && !isError && changeOrders.length > 0 && (
        <div className="stat-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground text-left">
                  <th className="py-2 px-4 font-medium">Title</th>
                  <th className="py-2 px-4 font-medium">Reason</th>
                  <th className="py-2 px-4 font-medium text-right">Amount</th>
                  <th className="py-2 px-4 font-medium">Status</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {changeOrders.map((co) => (
                  <Fragment key={co.id}>
                    <ChangeOrderRow
                      co={co}
                      isEditing={editingId === co.id}
                      onEdit={() => setEditingId(co.id)}
                      onApprove={() => statusMut.mutate({ co, status: "approved" })}
                      onReject={() => statusMut.mutate({ co, status: "rejected" })}
                      onRevert={() => statusMut.mutate({ co, status: "pending" })}
                      onDelete={() => deleteMut.mutate(co.id)}
                      statusPending={statusMut.isPending}
                    />
                    {editingId === co.id && (
                      <tr>
                        <td colSpan={5} className="bg-muted/40 p-4">
                          <ChangeOrderEditForm
                            co={co}
                            saving={editMut.isPending}
                            onCancel={() => setEditingId(null)}
                            onSave={(patch) => editMut.mutate({ id: co.id, ...patch })}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold text-foreground">
                  <td className="py-2 px-4" colSpan={2}>
                    Approved total
                  </td>
                  <td className={`py-2 px-4 text-right ${amountColor(approvedTotal)}`}>{signedCurrency(approvedTotal)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeOrderRow({
  co,
  isEditing,
  onEdit,
  onApprove,
  onReject,
  onRevert,
  onDelete,
  statusPending,
}: {
  co: ChangeOrder;
  isEditing: boolean;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRevert: () => void;
  onDelete: () => void;
  statusPending: boolean;
}) {
  const meta = changeOrderStatusMeta(co.status);
  const amount = Number(co.amount);
  const [photosOpen, setPhotosOpen] = useState(false);

  return (
    <tr className={`border-b border-border last:border-0 ${isEditing ? "bg-muted/40" : ""}`}>
      <td className="py-2 px-4 text-foreground">{co.title}</td>
      <td className="py-2 px-4 text-muted-foreground">{reasonLabel(co.reason)}</td>
      <td className={`py-2 px-4 text-right whitespace-nowrap font-semibold ${amountColor(amount)}`}>
        {signedCurrency(amount)}
      </td>
      <td className="py-2 px-4">
        {co.status === "pending" ? (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={onApprove}
              disabled={statusPending}
              className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success hover:bg-success/25 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={statusPending}
              className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive hover:bg-destructive/20 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill meta={meta} />
            <button
              type="button"
              onClick={onRevert}
              disabled={statusPending}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              Revert to pending
            </button>
          </div>
        )}
      </td>
      <td className="py-2 px-2">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setPhotosOpen(true)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Photos"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
          {co.status === "pending" && (
            <button type="button" onClick={onEdit} className="text-muted-foreground hover:text-foreground" aria-label="Edit">
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="text-muted-foreground hover:text-destructive" aria-label="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{co.title}"?</AlertDialogTitle>
                <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
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
        <ChangeOrderPhotosDialog changeOrderId={co.id} open={photosOpen} onOpenChange={setPhotosOpen} />
      </td>
    </tr>
  );
}

function ChangeOrderPhotosDialog({
  changeOrderId,
  open,
  onOpenChange,
}: {
  changeOrderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: images = [] } = useQuery({
    queryKey: ["change-order-images", changeOrderId],
    queryFn: () => listChangeOrderImages(changeOrderId),
    enabled: open,
  });

  const paths = images.map((i) => i.storage_path);
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["change-order-image-urls", changeOrderId, images.map((i) => i.id).join(",")],
    queryFn: () => getSignedImageUrls(paths),
    enabled: open && paths.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["change-order-images", changeOrderId] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const uploadMut = useMutation({
    mutationFn: async (files: File[]) => {
      for (let i = 0; i < files.length; i++) {
        await addChangeOrderImage(changeOrderId, files[i], { sort_order: images.length + i });
      }
    },
    onSuccess: invalidate,
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: (image: ChangeOrderImage) => deleteChangeOrderImage(image),
    onSuccess: invalidate,
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3 p-4">
        <DialogTitle className="text-sm font-bold text-foreground">Photos</DialogTitle>
        {images.length === 0 && <p className="text-sm text-muted-foreground">No photos yet.</p>}
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {images.map((img) => (
            <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
              {signedUrls[img.storage_path] ? (
                <img src={signedUrls[img.storage_path]} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-subtle" />
                </div>
              )}
              <button
                type="button"
                onClick={() => deleteMut.mutate(img)}
                disabled={deleteMut.isPending}
                aria-label="Delete photo"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMut.isPending}
            className="flex aspect-square items-center justify-center rounded-xl border-[1.5px] border-dashed border-border text-muted-subtle transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Add photos"
          >
            {uploadMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
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
      </DialogContent>
    </Dialog>
  );
}

function ChangeOrderEditForm({
  co,
  saving,
  onCancel,
  onSave,
}: {
  co: ChangeOrder;
  saving: boolean;
  onCancel: () => void;
  onSave: (patch: { title: string; description: string | null; reason: ChangeOrderReason | null; amount: number }) => void;
}) {
  const [title, setTitle] = useState(co.title);
  const [description, setDescription] = useState(co.description ?? "");
  const [reason, setReason] = useState<ChangeOrderReason | null>(co.reason);
  const [amount, setAmount] = useState(String(co.amount));

  const canSave = title.trim().length > 0 && amount.trim().length > 0 && !Number.isNaN(parseFloat(amount));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Amount</Label>
        <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Reason</Label>
        <Select value={reason ?? NONE} onValueChange={(v) => setReason(v === NONE ? null : (v as ChangeOrderReason))}>
          <SelectTrigger aria-label="Reason">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {CHANGE_ORDER_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={() =>
            onSave({ title: title.trim(), description: description.trim() || null, reason, amount: parseFloat(amount) || 0 })
          }
          disabled={!canSave || saving}
          className="font-bold"
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
