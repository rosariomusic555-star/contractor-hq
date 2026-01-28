import { useState } from "react";
import { Plus, Search, MoreHorizontal, Eye, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuoteModal } from "@/components/modals/QuoteModal";

interface Quote {
  id: string;
  number: string;
  client: string;
  project: string;
  amount: number;
  status: "draft" | "sent" | "approved" | "rejected";
  date: string;
  validUntil: string;
}

const initialQuotes: Quote[] = [
  {
    id: "1",
    number: "QT-001",
    client: "Thompson Residence",
    project: "Kitchen Remodel",
    amount: 8500,
    status: "approved",
    date: "2024-01-15",
    validUntil: "2024-02-15",
  },
  {
    id: "2",
    number: "QT-002",
    client: "Oak Street Renovation",
    project: "Full Home Renovation",
    amount: 45000,
    status: "sent",
    date: "2024-01-18",
    validUntil: "2024-02-18",
  },
  {
    id: "3",
    number: "QT-003",
    client: "Martinez Family",
    project: "Bathroom Addition",
    amount: 12800,
    status: "draft",
    date: "2024-01-20",
    validUntil: "2024-02-20",
  },
  {
    id: "4",
    number: "QT-004",
    client: "Downtown Office",
    project: "Commercial Build-out",
    amount: 78500,
    status: "sent",
    date: "2024-01-22",
    validUntil: "2024-02-22",
  },
];

const statusStyles = {
  draft: "badge-status badge-draft",
  sent: "badge-status badge-pending",
  approved: "badge-status badge-paid",
  rejected: "badge-status badge-overdue",
};

export function QuotesView() {
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredQuotes = quotes.filter(
    (quote) =>
      quote.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.project.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateQuote = (data: { client: string; project: string; amount: number; validDays: number }) => {
    const newQuote: Quote = {
      id: String(quotes.length + 1),
      number: `QT-${String(quotes.length + 1).padStart(3, "0")}`,
      client: data.client,
      project: data.project,
      amount: data.amount,
      status: "draft",
      date: new Date().toISOString().split("T")[0],
      validUntil: new Date(Date.now() + data.validDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    };
    setQuotes([newQuote, ...quotes]);
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Quotes</h1>
          <p className="text-muted-foreground mt-1">Create and manage project quotes</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          New Quote
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search quotes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {filteredQuotes.map((quote) => (
          <div key={quote.id} className="stat-card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-foreground">{quote.number}</p>
                <p className="text-sm text-muted-foreground">{quote.client}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={statusStyles[quote.status]}>
                  {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem><Eye className="w-4 h-4 mr-2" />View</DropdownMenuItem>
                    <DropdownMenuItem><Edit className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive"><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{quote.project}</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Valid until {quote.validUntil}</span>
              <span className="font-bold text-lg">${quote.amount.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block stat-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr className="bg-muted/50">
                <th>Quote #</th>
                <th>Client</th>
                <th>Project</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th>Valid Until</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.map((quote) => (
                <tr key={quote.id}>
                  <td className="font-medium">{quote.number}</td>
                  <td>{quote.client}</td>
                  <td className="text-muted-foreground">{quote.project}</td>
                  <td className="font-semibold">${quote.amount.toLocaleString()}</td>
                  <td>
                    <span className={statusStyles[quote.status]}>
                      {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                    </span>
                  </td>
                  <td className="text-muted-foreground">{quote.date}</td>
                  <td className="text-muted-foreground">{quote.validUntil}</td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem><Eye className="w-4 h-4 mr-2" />View</DropdownMenuItem>
                        <DropdownMenuItem><Edit className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive"><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <QuoteModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleCreateQuote}
      />
    </div>
  );
}
