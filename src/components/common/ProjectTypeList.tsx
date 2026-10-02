import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus } from "lucide-react";
import { CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { MultiSelectList } from "@/components/common/MultiSelectList";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ProjectTypesEditor } from "@/components/projectTypes/ProjectTypesEditor";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createCategory, type Category } from "@/lib/api";
import { useProjectTypeOptions } from "@/hooks/use-project-type-options";

/**
 * Project types as the shared multi-select list (MultiSelectList: checkbox
 * rows, "Select all that apply", N selected + Done) with type-to-search.
 * Clicking toggles without closing. Height fits the space left on screen in
 * a popover, so the last types are never cut off below the fold.
 *
 * Search text with no exact match offers "+ Add "<text>" as a new project
 * type" (creates it, selects it, list stays open); "Edit project types…" at
 * the bottom opens a quick editor (add / rename / reorder) without leaving
 * the page. Order is always Settings › Project types' order.
 */
export function ProjectTypeList({
  value,
  onToggle,
  large = false,
  listClassName,
  onDone,
}: {
  value: string[];
  onToggle: (id: string) => void;
  /** Phone bottom sheets: taller rows. */
  large?: boolean;
  listClassName?: string;
  /** The footer's Done (closes the popover / sheet around it). */
  onDone?: () => void;
}) {
  const { options, all } = useProjectTypeOptions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);

  const typed = search.trim();
  // Checked against every type (the hidden catch-all too) — never a duplicate name.
  const exact = !!typed && all.some((c) => c.name.trim().toLowerCase() === typed.toLowerCase());

  const create = useMutation({
    mutationFn: (name: string) => createCategory({ name, sort_order: all.length }),
    onSuccess: (cat: Category) => {
      qc.setQueryData<Category[]>(["categories"], (old) => [...(old ?? []), cat]);
      qc.invalidateQueries({ queryKey: ["categories"] });
      onToggle(cat.id);
      setSearch("");
      toast({ title: `Added "${cat.name}" as a project type` });
    },
    onError: (e: Error) => toast({ title: "Couldn't add the type", description: e.message, variant: "destructive" }),
  });

  const row = cn("data-[selected='true']:bg-muted", large ? "min-h-12 text-base" : "min-h-11 sm:min-h-9");

  return (
    <>
      <MultiSelectList
        options={options.map((c) => ({ id: c.id, label: c.name }))}
        value={value}
        // Only the toggled id changes — a hidden catch-all already set is kept.
        onChange={(next) => {
          const changed = [...next.filter((id) => !value.includes(id)), ...value.filter((id) => !next.includes(id))];
          changed.forEach(onToggle);
        }}
        search
        searchPlaceholder="Search or add a type…"
        searchValue={search}
        onSearchChange={setSearch}
        emptyText={options.length === 0 ? "No project types yet." : "No matching type."}
        large={large}
        listClassName={listClassName}
        onDone={onDone}
      >
        {typed && !exact && (
          <CommandGroup forceMount>
            <CommandItem
              forceMount
              value={`__add__${typed}`}
              onSelect={() => !create.isPending && create.mutate(typed)}
              className={cn("font-semibold text-primary", row)}
            >
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add “{typed}” as a new project type
            </CommandItem>
          </CommandGroup>
        )}
        <CommandSeparator alwaysRender />
        <CommandGroup forceMount>
          <CommandItem forceMount value="__edit_types__" onSelect={() => setEditorOpen(true)} className={cn("text-muted-foreground", row)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit project types…
          </CommandItem>
        </CommandGroup>
      </MultiSelectList>

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={cn("overflow-y-auto", isMobile ? "max-h-[90dvh] rounded-t-2xl" : "w-full sm:max-w-md")}>
          <SheetHeader className="text-left">
            <SheetTitle>Project types</SheetTitle>
            <SheetDescription>
              Add, rename or drag to reorder — every picker uses this order. Deleting and the full list live in{" "}
              <Link to="/settings/project-types" className="font-semibold text-primary hover:underline" onClick={() => setEditorOpen(false)}>
                Settings › Project types
              </Link>
              .
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <ProjectTypesEditor compact />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
