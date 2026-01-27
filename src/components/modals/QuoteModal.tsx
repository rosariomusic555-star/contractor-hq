import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { client: string; project: string; amount: number; validDays: number }) => void;
}

export function QuoteModal({ isOpen, onClose, onSubmit }: QuoteModalProps) {
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [amount, setAmount] = useState("");
  const [validDays, setValidDays] = useState("30");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      client,
      project,
      amount: parseFloat(amount),
      validDays: parseInt(validDays),
    });
    setClient("");
    setProject("");
    setAmount("");
    setValidDays("30");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Quote</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client">Client Name</Label>
            <Input
              id="client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Enter client name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project">Project Description</Label>
            <Input
              id="project"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="E.g., Kitchen Remodel"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($)</Label>
              <Input
                id="amount"
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
              <Label htmlFor="validDays">Valid for (days)</Label>
              <Input
                id="validDays"
                type="number"
                value={validDays}
                onChange={(e) => setValidDays(e.target.value)}
                placeholder="30"
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
              Create Quote
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
