import { useState } from "react";
import { Plus, Search, MoreHorizontal, Phone, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  totalProjects: number;
  totalRevenue: number;
}

const clients: Client[] = [
  {
    id: "1",
    name: "Thompson Residence",
    email: "thompson@email.com",
    phone: "(555) 123-4567",
    address: "123 Oak Street, Springfield",
    totalProjects: 3,
    totalRevenue: 24500,
  },
  {
    id: "2",
    name: "Oak Street Renovation",
    email: "oakstreet@email.com",
    phone: "(555) 234-5678",
    address: "456 Main Ave, Riverside",
    totalProjects: 1,
    totalRevenue: 45000,
  },
  {
    id: "3",
    name: "Martinez Family",
    email: "martinez@email.com",
    phone: "(555) 345-6789",
    address: "789 Pine Road, Lakewood",
    totalProjects: 2,
    totalRevenue: 19200,
  },
  {
    id: "4",
    name: "Downtown Office",
    email: "downtown@business.com",
    phone: "(555) 456-7890",
    address: "100 Business Center, Metro City",
    totalProjects: 1,
    totalRevenue: 78500,
  },
  {
    id: "5",
    name: "Green Valley HOA",
    email: "hoa@greenvalley.org",
    phone: "(555) 567-8901",
    address: "Green Valley Community Center",
    totalProjects: 5,
    totalRevenue: 35000,
  },
];

export function ClientsView() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">{clients.length} total clients</p>
        </div>
        <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
          <Plus className="w-4 h-4 mr-2" />
          Add Client
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Client Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClients.map((client) => (
          <div key={client.id} className="stat-card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-lg font-semibold text-primary-foreground">
                    {client.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{client.name}</h3>
                  <p className="text-sm text-muted-foreground">{client.totalProjects} projects</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View Details</DropdownMenuItem>
                  <DropdownMenuItem>Edit</DropdownMenuItem>
                  <DropdownMenuItem>Create Quote</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="w-4 h-4" />
                <span>{client.email}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span>{client.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>{client.address}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Revenue</span>
                <span className="text-lg font-bold text-foreground">
                  ${client.totalRevenue.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
