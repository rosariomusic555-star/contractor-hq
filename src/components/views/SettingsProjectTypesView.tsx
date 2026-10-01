import { Shapes } from "lucide-react";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { ProjectTypesEditor } from "@/components/projectTypes/ProjectTypesEditor";

/**
 * Settings › Project types — the one place for the contractor's type list
 * (it replaced Settings › Categories and the panel on Smart Section
 * templates; it's the same `categories` list). The order here is the order
 * every picker shows.
 */
export function SettingsProjectTypesView() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Project types" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Project types</h1>
      </div>

      <section className="card-surface space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Shapes className="h-4 w-4" />
          </span>
          <p className="text-sm text-muted-foreground">
            Your one list of project types — what opportunities and projects are tagged with, what quote and cost plan sections are, and
            what Revenue groups by. Drag to set the order every picker uses. Types whose name matches a built-in type get its measurement
            card, Smart Section calculator and Quick Quote.
          </p>
        </div>
        <ProjectTypesEditor />
      </section>
    </div>
  );
}
