import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ClientFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
}

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ClientFormData) => void;
  /** Pre-fill the form for editing. Omit / null for a fresh "add client". */
  initial?: Partial<ClientFormData> | null;
  title?: string;
  submitLabel?: string;
}

const empty: ClientFormData = { name: "", email: "", phone: "", address: "" };

export function ClientModal({
  isOpen,
  onClose,
  onSubmit,
  initial,
  title = "Add New Client",
  submitLabel = "Add Client",
}: ClientModalProps) {
  const [form, setForm] = useState<ClientFormData>(empty);

  // Re-seed whenever the modal opens (or the client being edited changes).
  useEffect(() => {
    if (isOpen) setForm({ ...empty, ...initial });
  }, [isOpen, initial]);

  const set = (patch: Partial<ClientFormData>) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client-name">Client Name</Label>
            <Input
              id="client-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Enter client name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-email">Email</Label>
            <Input
              id="client-email"
              type="email"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
              placeholder="client@email.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-phone">Phone</Label>
            <Input
              id="client-phone"
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
              placeholder="(555) 123-4567"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-address">
              Address <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="client-address"
              value={form.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="123 Oak Street, Springfield"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
