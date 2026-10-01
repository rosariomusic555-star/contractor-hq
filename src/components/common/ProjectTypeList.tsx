import { Check } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useProjectTypeOptions } from "@/hooks/use-project-type-options";

/**
 * Checkbox list of Project types with type-to-search. Clicking toggles
 * without closing. Height fits the space left on screen in a popover
 * (`--radix-popover-content-available-height`), so the last types are never
 * cut off below the fold.
 */
export function ProjectTypeList({
  value,
  onToggle,
  large = false,
  listClassName,
}: {
  value: string[];
  onToggle: (id: string) => void;
  /** Phone bottom sheets: taller rows. */
  large?: boolean;
  listClassName?: string;
}) {
  const { options } = useProjectTypeOptions();
  return (
    <Command>
      {options.length > 6 && <CommandInput placeholder="Search types…" className={large ? "h-12 text-base" : undefined} />}
      <CommandList
        className={cn(
          large
            ? "max-h-[60vh]"
            : "max-h-[min(20rem,calc(var(--radix-popover-content-available-height,24rem)-3.25rem))]",
          listClassName,
        )}
      >
        <CommandEmpty>{options.length === 0 ? "No project types yet — add some in Settings." : "No matching type."}</CommandEmpty>
        <CommandGroup>
          {options.map((c) => (
            <CommandItem key={c.id} value={c.name} onSelect={() => onToggle(c.id)} className={large ? "min-h-12 text-base" : undefined}>
              <Check className={cn("mr-2 h-4 w-4", value.includes(c.id) ? "opacity-100" : "opacity-0")} />
              {c.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
