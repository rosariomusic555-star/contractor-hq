import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { listSuppliers, createSupplier } from "@/lib/api";

interface SupplierComboboxProps {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * A contractor's own supplier list (src/lib/api.ts Supplier — separate from
 * Product Catalog manufacturers), as a typeable combobox: click to browse,
 * type to filter, and — if nothing matches — a "Create" row that saves the
 * typed name to the supplier list and fills the field, no separate dialog.
 * Styled to match a plain `<Input>` exactly so it drops into any form that
 * used to have a free-text supplier field.
 */
export function SupplierCombobox({ value, onChange, placeholder, className }: SupplierComboboxProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);

  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: listSuppliers });

  const createMut = useMutation({
    mutationFn: (name: string) => createSupplier({ name }),
    onSuccess: (supplier) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      onChange(supplier.name);
      setOpen(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const trimmedSearch = search.trim();
  const filtered = trimmedSearch
    ? suppliers.filter((s) => s.name.toLowerCase().includes(trimmedSearch.toLowerCase()))
    : suppliers;
  const exactMatch = suppliers.some((s) => s.name.toLowerCase() === trimmedSearch.toLowerCase());
  const showCreate = trimmedSearch.length > 0 && !exactMatch;

  const select = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSearch(value);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value || placeholder || "Select supplier…"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Search suppliers…" />
          <CommandList>
            {filtered.length === 0 && !showCreate && <CommandEmpty>No suppliers yet</CommandEmpty>}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((s) => (
                  <CommandItem key={s.id} value={s.id} onSelect={() => select(s.name)}>
                    <Check className={cn("mr-2 h-4 w-4", value === s.name ? "opacity-100" : "opacity-0")} />
                    {s.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreate && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${trimmedSearch}`}
                  disabled={createMut.isPending}
                  onSelect={() => createMut.mutate(trimmedSearch)}
                  className="font-medium text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create "{trimmedSearch}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
