import { useState } from "react";
import { Menu, Search, ArrowUpDown, SlidersHorizontal, Plus, Maximize2, FileText, Calculator, Calendar, MoreHorizontal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
}

interface Job {
  id: string;
  title: string;
  client: string;
  address: string;
  status: string;
}

interface RecentItem {
  id: string;
  client: string;
  date: string;
  number: string;
  amount: string;
  status: "Pending" | "Invoiced" | "Paid";
}

const currentJobs: Job[] = [
  {
    id: "1",
    title: "Current Jobs",
    client: "Thompson Residence",
    address: "1234 Oak Street",
    status: "In Progress"
  },
  {
    id: "2",
    title: "Kitchen Remodel",
    client: "Martinez Family",
    address: "567 Pine Avenue",
    status: "In Progress"
  },
  {
    id: "3",
    title: "Bathroom Renovation",
    client: "Johnson Home",
    address: "890 Maple Drive",
    status: "Starting Soon"
  },
  {
    id: "4",
    title: "Deck Construction",
    client: "Williams Property",
    address: "321 Cedar Lane",
    status: "In Progress"
  }
];

const recentItems: RecentItem[] = [
  { id: "1", client: "John", date: "January 30", number: "#80", amount: "$18,500", status: "Pending" },
  { id: "2", client: "Megan", date: "January 30", number: "#79", amount: "$7,950", status: "Invoiced" },
  { id: "3", client: "Anthony", date: "January 30", number: "#78", amount: "$21,530", status: "Pending" },
  { id: "4", client: "Nick", date: "January 30", number: "#77", amount: "$19,550", status: "Invoiced" },
  { id: "5", client: "Sarah", date: "January 29", number: "#76", amount: "$12,800", status: "Paid" },
  { id: "6", client: "Mike", date: "January 29", number: "#75", amount: "$8,200", status: "Pending" },
  { id: "7", client: "Lisa", date: "January 28", number: "#74", amount: "$15,300", status: "Invoiced" },
  { id: "8", client: "David", date: "January 28", number: "#73", amount: "$9,750", status: "Pending" },
];

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const filteredItems = recentItems.filter(item =>
    item.client.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between">
        <Avatar className="h-12 w-12 border-2 border-primary/20">
          <AvatarImage src="" />
          <AvatarFallback className="bg-blue-100 text-blue-600">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="8" r="4" opacity="0.6" />
              <path d="M12 14c-6 0-8 3-8 6v1h16v-1c0-3-2-6-8-6z" opacity="0.6" />
            </svg>
          </AvatarFallback>
        </Avatar>
        
        <div className="text-center">
          <h1 className="text-lg font-semibold text-foreground">Mike's Contracting</h1>
          <p className="text-sm text-muted-foreground">Welcome back, Mike!</p>
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
            <div
              key={job.id}
              className="flex-shrink-0 w-40 h-32 bg-primary rounded-xl p-4 snap-start relative"
            >
              <div className="text-primary-foreground">
                <h3 className="font-semibold text-sm mb-2">{job.title}</h3>
                <div className="space-y-1">
                  <div className="h-1.5 bg-primary-foreground/30 rounded w-full" />
                  <div className="h-1.5 bg-primary-foreground/30 rounded w-4/5" />
                  <div className="h-1.5 bg-primary-foreground/30 rounded w-3/5" />
                </div>
              </div>
              <button className="absolute bottom-3 right-3 text-primary-foreground/70 hover:text-primary-foreground">
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          ))}
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
                index % 2 === 0 ? "bg-card" : "bg-muted/30"
              )}
            >
              <div>
                <p className="font-semibold text-foreground text-lg">{item.client}</p>
                <p className="text-sm text-muted-foreground">
                  {item.date} | {item.number}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground text-lg">{item.amount}</p>
                <p className={cn(
                  "text-sm",
                  item.status === "Pending" && "text-muted-foreground",
                  item.status === "Invoiced" && "text-primary",
                  item.status === "Paid" && "text-success"
                )}>
                  {item.status}
                </p>
              </div>
            </div>
          ))}
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
