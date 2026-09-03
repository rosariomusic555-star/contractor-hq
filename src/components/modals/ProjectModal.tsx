import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Client } from "@/lib/api";

const NO_CLIENT = "__none__";
const NEW_CLIENT = "__new__";

export interface ProjectSubmit {
  name: string;
  clientId: string | null;
  newClient: { name: string; email: string; phone: string } | null;
}

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  submitting?: boolean;
  onSubmit: (data: ProjectSubmit) => void;
}

export function ProjectModal({ isOpen, onClose, clients, submitting, onSubmit }: ProjectModalProps) {
  const [name, setName] = useState("");
  const [clientChoice, setClientChoice] = useState<string>(NO_CLIENT);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const reset = () => {
    setName("");
    setClientChoice(NO_CLIENT);
    setNewName("");
    setNewEmail("");
    setNewPhone("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const creatingNew = clientChoice === NEW_CLIENT;
    if (creatingNew && !newName.trim()) return;
    onSubmit({
      name: name.trim(),
      clientId: creatingNew || clientChoice === NO_CLIENT ? null : clientChoice,
      newClient: creatingNew
        ? { name: newName.trim(), email: newEmail.trim(), phone: newPhone.trim() }
        : null,
    });
    reset();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="E.g., Smith Backyard Patio"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-client">Client</Label>
            <Select value={clientChoice} onValueChange={setClientChoice}>
              <SelectTrigger id="project-client">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLIENT}>No client</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_CLIENT}>+ Create new client</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {clientChoice === NEW_CLIENT && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-2">
                <Label htmlFor="new-client-name">Client name</Label>
                <Input
                  id="new-client-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Client name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-client-email">Email</Label>
                <Input
                  id="new-client-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="client@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-client-phone">Phone</Label>
                <Input
                  id="new-client-phone"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {submitting ? "Creating…" : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
