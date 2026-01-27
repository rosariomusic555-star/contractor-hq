import { useState } from "react";
import { Plus, Search, MoreHorizontal, Eye, Edit, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvoiceModal } from "@/components/modals/InvoiceModal";

interface Invoice {
  id: string;
  number: string;
  client: string;
  project: string;
  amount: number;
  status: "draft" | "sent" | "paid" | "overdue";
  date: string;
  dueDate: string;
}

const initialInvoices: Invoice[] = [
  {
    id: "1",
    number: "INV-001",
    client: "Thompson Residence",
    project: "Kitchen Remodel",
    amount: 8500,
    status: "paid",
    date: "2024-01-10",
    dueDate: "2024-01-25",
  },
  {
    id: "2",
    number: "INV-002",
    client: "Oak Street Renovation",
    project: "Full Home Renovation",
    amount: 15000,
    status: "sent",
    date: "2024-01-15",
    dueDate: "2024-01-30",
  },
  {
    id: "3",
    number: "INV-003",
    client: "Downtown Office",
    project: "Commercial Build-out",
    amount: 24000,
    status: "overdue",
    date: "2024-01-01",
    dueDate: "2024-01-15",
  },
  {
    id: "4",
    number: "INV-004",
    client: "Martinez Family",
    project: "Bathroom Addition",
    amount: 6400,
    status: "draft",
    date: "2024-01-22",
    dueDate: "2024-02-06",
  },
];

const statusStyles = {
  draft: "badge-status badge-draft",
  sent: "badge-status badge-pending",
  paid: "badge-status badge-paid",
  overdue: "badge-status badge-overdue",
};

export function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredInvoices = invoices.filter(
    (invoice) =>
      invoice.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.project.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateInvoice = (data: { client: string; project: string; amount: number; dueDays: number }) => {
    const newInvoice: Invoice = {
      id: String(invoices.length + 1),
      number: `INV-${String(invoices.length + 1).padStart(3, "0")}`,
      client: data.client,
      project: data.project,
      amount: data.amount,
      status: "draft",
      date: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + data.dueDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    };
    setInvoices([newInvoice, ...invoices]);
  };

  const totalOutstanding = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground mt-1">
            Outstanding: <span className="font-semibold text-foreground">${totalOutstanding.toLocaleString()}</span>
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
          <Plus className="w-4 h-4 mr-2" />
          New Invoice
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search invoices..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="stat-card overflow-hidden p-0">
        <table className="data-table">
          <thead>
            <tr className="bg-muted/50">
              <th>Invoice #</th>
              <th>Client</th>
              <th>Project</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
              <th>Due Date</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="font-medium">{invoice.number}</td>
                <td>{invoice.client}</td>
                <td className="text-muted-foreground">{invoice.project}</td>
                <td className="font-semibold">${invoice.amount.toLocaleString()}</td>
                <td>
                  <span className={statusStyles[invoice.status]}>
                    {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                  </span>
                </td>
                <td className="text-muted-foreground">{invoice.date}</td>
                <td className="text-muted-foreground">{invoice.dueDate}</td>
                <td>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Send className="w-4 h-4 mr-2" />
                        Send
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InvoiceModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleCreateInvoice}
      />
    </div>
  );
}
