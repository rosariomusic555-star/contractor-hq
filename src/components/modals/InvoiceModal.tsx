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
import type { ProjectType } from "@/lib/api";

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    client: string;
    project: string;
    amount: number;
    dueDays: number;
    projectType: ProjectType | null;
  }) => void;
}

const projectTypeOptions: { value: ProjectType; label: string }[] = [
  { value: "renovation", label: "Renovation" },
  { value: "new_construction", label: "New Construction" },
  { value: "repair", label: "Repair" },
  { value: "maintenance", label: "Maintenance" },
];

export function InvoiceModal({ isOpen, onClose, onSubmit }: InvoiceModalProps) {
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDays, setDueDays] = useState("15");
  const [projectType, setProjectType] = useState<ProjectType | "">("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      client,
      project,
      amount: parseFloat(amount),
      dueDays: parseInt(dueDays),
      projectType: projectType || null,
    });
    setClient("");
    setProject("");
    setAmount("");
    setDueDays("15");
    setProjectType("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Invoice</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inv-client">Client Name</Label>
            <Input
              id="inv-client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Enter client name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-project">Project Description</Label>
            <Input
              id="inv-project"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="E.g., Kitchen Remodel"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-project-type">Project Type</Label>
            <Select value={projectType} onValueChange={(v) => setProjectType(v as ProjectType)}>
              <SelectTrigger id="inv-project-type">
                <SelectValue placeholder="Select a type (optional)" />
              </SelectTrigger>
              <SelectContent>
                {projectTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="inv-amount">Amount ($)</Label>
              <Input
                id="inv-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDays">Due in (days)</Label>
              <Input
                id="dueDays"
                type="number"
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value)}
                placeholder="15"
                min="1"
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-accent hover:bg-accent/90 text-accent-foreground">
              Create Invoice
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
