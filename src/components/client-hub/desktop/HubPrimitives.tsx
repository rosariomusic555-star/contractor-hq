import type { ReactNode } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { HUB_TONE_CLASS, type HubTone } from "@/lib/hubDesktop";
import { useSignedUrl, type SignUrls } from "./hubUtils";

export function HubLogo({ path, signUrls, className }: { path: string | null; signUrls: SignUrls; className?: string }) {
  const url = useSignedUrl(path, signUrls);
  if (!url) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary", className)}>
        <Building2 className="h-1/2 w-1/2" />
      </span>
    );
  }
  return <img src={url} alt="" className={cn("shrink-0 rounded-xl object-cover", className)} />;
}

export function TonePill({ tone, children, className }: { tone: HubTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", HUB_TONE_CLASS[tone], className)}>{children}</span>
  );
}

export function HubCard({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("card-surface scroll-mt-6 p-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-bold text-foreground">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function MoneyLine({ label, value, strong, muted }: { label: ReactNode; value: ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5 text-sm", strong && "border-t border-border pt-2.5")}>
      <span className={cn(strong ? "font-bold text-foreground" : "text-muted-foreground", muted && "text-muted-subtle")}>{label}</span>
      <span className={cn("shrink-0 tabular-nums", strong ? "text-base font-extrabold text-foreground" : "font-semibold text-foreground")}>{value}</span>
    </div>
  );
}

