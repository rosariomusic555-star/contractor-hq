import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu, Search, ArrowUpDown, SlidersHorizontal, Plus, Maximize2, FileText, Calculator, Calendar, MoreHorizontal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { listQuotes, listInvoices } from "@/lib/api";

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
}

type RecentStatus = "Pending" | "Invoiced" | "Paid";

interface RecentItem {
  id: string;
  client: string;
  dateISO: string;
  number: string;
  amount: number;
  status: RecentStatus;
  createdAt: string;
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const longDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const { session } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: listQuotes });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: listInvoices });

  const email = session?.user.email ?? "";
  const name = email ? email.split("@")[0].replace(/[._-]+/g, " ") : "there";
  const initials = email.slice(0, 2).toUpperCase() || "?";

  // Active work = quotes not yet won/lost, newest first.
  const currentJobs = useMemo(
    () =>
      quotes
        .filter((q) => q.status === "draft" || q.status === "sent")
        .slice(0, 8),
    [quotes],
  );

  const recentItems = useMemo<RecentItem[]>(() => {
    const fromQuotes: RecentItem[] = quotes.map((q) => ({
      id: `quote-${q.id}`,
      client: q.client,
      dateISO: q.issue_date,
      number: q.number,
      amount: Number(q.amount),
      status: "Pending",
      createdAt: q.created_at,
    }));
    const fromInvoices: RecentItem[] = invoices.map((i) => ({
      id: `invoice-${i.id}`,
      client: i.client,
      dateISO: i.issue_date,
      number: i.number,
      amount: Number(i.amount),
      status: i.status === "paid" ? "Paid" : "Invoiced",
      createdAt: i.created_at,
    }));
    return [...fromQuotes, ...fromInvoices]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
  }, [quotes, invoices]);

  const filteredItems = recentItems.filter((item) =>
    item.client.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between">
        <Avatar className="h-12 w-12 border-2 border-primary/20">
          <AvatarImage src="" />
          <AvatarFallback className="bg-blue-100 text-blue-600 font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="text-center">
          <h1 className="text-lg font-semibold text-foreground capitalize">{name}</h1>
          <p className="text-sm text-muted-foreground">Welcome back!</p>
        </div>

        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Menu className="h-6 w-6 text-foreground" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <nav className="mt-6 space-y-2">
              {["Dashboard", "Quotes", "Invoices", "Clients", "Revenue", "Settings"].map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    onNavigate(item.toLowerCase());
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg hover:bg-muted transition-colors"
                >
                  {item}
                </button>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      {/* Current Jobs Carousel */}
      <div className="px-4 py-4">
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
          {currentJobs.map((job) => (
            <button
              key={job.id}
              onClick={() => onNavigate("quotes")}
              className="flex-shrink-0 w-40 h-32 bg-primary rounded-xl p-4 snap-start relative text-left"
            >
              <div className="text-primary-foreground">
                <h3 className="font-semibold text-sm mb-1 line-clamp-2">
                  {job.project || "Untitled quote"}
                </h3>
                <p className="text-xs text-primary-foreground/70 line-clamp-1">{job.client}</p>
                <p className="text-sm font-semibold mt-2">{money(job.amount)}</p>
              </div>
              <Maximize2 className="absolute bottom-3 right-3 h-4 w-4 text-primary-foreground/70" />
            </button>
          ))}
          {currentJobs.length === 0 && (
            <div className="flex-shrink-0 w-40 h-32 bg-muted rounded-xl p-4 flex items-center justify-center text-center text-sm text-muted-foreground">
              No active quotes
            </div>
          )}
        </div>
        {/* Carousel Indicator */}
        <div className="flex justify-center">
          <div className="h-1 w-16 bg-muted-foreground/30 rounded-full" />
        </div>
      </div>

      {/* Recents Section */}
      <div className="flex-1 px-4 pb-24">
        {/* Recents Header */}
        <div className="flex items-center gap-3 py-4">
          <h2 className="text-lg font-semibold text-foreground whitespace-nowrap">Recents</h2>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-muted/50 border-0"
            />
          </div>

          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <ArrowUpDown className="h-5 w-5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>

        {/* Recent Items List */}
        <div className="space-y-0">
          {filteredItems.map((item, index) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center justify-between py-4 px-4 -mx-4",
                index % 2 === 0 ? "bg-card" : "bg-muted/30",
              )}
            >
              <div>
                <p className="font-semibold text-foreground text-lg">{item.client}</p>
                <p className="text-sm text-muted-foreground">
                  {longDate(item.dateISO)} | {item.number}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground text-lg">{money(item.amount)}</p>
                <p
                  className={cn(
                    "text-sm",
                    item.status === "Pending" && "text-muted-foreground",
                    item.status === "Invoiced" && "text-primary",
                    item.status === "Paid" && "text-success",
                  )}
                >
                  {item.status}
                </p>
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {recentItems.length === 0 ? "No quotes or invoices yet." : "No matches."}
            </p>
          )}
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => onNavigate("quotes")}
        className="fixed bottom-24 right-6 w-14 h-14 bg-card rounded-full shadow-lg flex items-center justify-center border border-border hover:shadow-xl transition-shadow z-10"
      >
        <Plus className="h-7 w-7 text-primary" />
      </button>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-primary border-t border-primary-foreground/10 px-4 py-2 md:hidden z-20">
        <div className="flex items-center justify-around">
          <button
            onClick={() => onNavigate("quotes")}
            className="flex flex-col items-center gap-1 py-2 px-4 text-primary-foreground/80 hover:text-primary-foreground transition-colors"
          >
            <FileText className="h-6 w-6" />
            <span className="text-xs font-medium">Quotes</span>
          </button>
          <button
            onClick={() => onNavigate("invoices")}
            className="flex flex-col items-center gap-1 py-2 px-4 text-primary-foreground/80 hover:text-primary-foreground transition-colors"
          >
            <Calculator className="h-6 w-6" />
            <span className="text-xs font-medium">Estimates</span>
          </button>
          <button
            onClick={() => onNavigate("revenue")}
            className="flex flex-col items-center gap-1 py-2 px-4 text-primary-foreground/80 hover:text-primary-foreground transition-colors"
          >
            <Calendar className="h-6 w-6" />
            <span className="text-xs font-medium">Calendar</span>
          </button>
          <button
            onClick={() => onNavigate("settings")}
            className="flex flex-col items-center gap-1 py-2 px-4 text-primary-foreground/80 hover:text-primary-foreground transition-colors"
          >
            <MoreHorizontal className="h-6 w-6" />
            <span className="text-xs font-medium sr-only">More</span>
          </button>
        </div>
      </div>
    </div>
  );
}
