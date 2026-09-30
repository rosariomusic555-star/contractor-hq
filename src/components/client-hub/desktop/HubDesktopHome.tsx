import { useState, type ReactNode } from "react";
import { ImageIcon, MapPin, MessageCircle, Package, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { PortalProjectDetail } from "@/lib/portalApi";
import { PORTAL_PHASE_LABEL, portalProjectPhase } from "@/lib/portalStatus";
import { attentionItems, coverPhotoPath, phaseTone, projectScopeSections, whatsNext, type HubTone } from "@/lib/hubDesktop";
import { useMinWidth } from "@/hooks/use-hub-layout";
import { ProgressSection } from "@/components/client-hub/ProgressSection";
import { ProjectHistoryTimeline } from "@/components/client-hub/ProjectHistoryTimeline";
import { ContractBlock } from "@/components/client-hub/ProjectMoneyBlocks";
import { ApprovedSelectionsCard } from "@/components/client-hub/ApprovedSelectionsCard";
import { CareSection } from "@/components/client-hub/CareSection";
import { ReviewCard } from "@/components/client-hub/ReviewCard";
import { AttentionCard, BalanceCard, ContactCard, ContactDetails, ScheduleCard } from "./HubSideCards";
import { HubDocumentsCard } from "./HubDocumentsCard";
import { HubCard, HubLogo, TonePill } from "./HubPrimitives";
import { focusRing, hubDate, useSignedUrl, type SignUrls } from "./hubUtils";

/**
 * The Client Hub's desktop project home (the default on md and up): a
 * branded header band with "What's next", then — from `twoColumnMin` up — a
 * main column (progress, history + contract, documents, …) beside a sticky
 * side column (needs your attention, balance, schedule, contact; care and
 * review once the job is complete). Narrower (tablet): one wider column with
 * attention and balance first. Everything comes from the same client-safe
 * payload and components as the phone layout.
 *
 * `photos` / `messages` are passed in by the Hub (they read through the
 * client's portal session); the contractor's read-only Client view leaves
 * them out.
 */
export function HubDesktopHome({
  detail,
  projectId,
  docBase,
  signUrls,
  interactive,
  twoColumnMin,
  photos,
  messages,
}: {
  detail: PortalProjectDetail;
  projectId: string;
  docBase: string;
  signUrls: SignUrls;
  interactive: boolean;
  twoColumnMin: number;
  photos?: ReactNode;
  messages?: ReactNode;
}) {
  const twoCol = useMinWidth(twoColumnMin);
  const items = attentionItems(detail);
  const complete = portalProjectPhase(detail.project) === "complete";
  const hasProgress = !!detail.progress && (detail.progress.updates.length > 0 || detail.progress.before_after.length > 0);

  const goToMessages = messages
    ? () => {
        const el = document.getElementById("messages");
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        el?.querySelector("textarea")?.focus({ preventScroll: true });
      }
    : undefined;

  const attention = <AttentionCard key="attention" items={items} docBase={docBase} />;
  const care = complete ? (
    <div key="care" className="space-y-5">
      <CareSection detail={detail} projectId={projectId} interactive={interactive} />
      <ReviewCard detail={detail} stacked={twoCol} />
    </div>
  ) : null;
  const balance = <BalanceCard key="balance" detail={detail} docBase={docBase} items={items} />;
  const schedule = complete ? null : <ScheduleCard key="schedule" detail={detail} />;
  const contact = <ContactCard key="contact" detail={detail} onMessage={goToMessages} />;

  const progress = hasProgress ? (
    <ProgressSection key="progress" detail={detail} projectId={projectId} signUrls={signUrls} interactive={interactive} />
  ) : complete ? null : (
    <HubCard key="progress" title="Progress">
      <p className="text-sm text-muted-foreground">Updates and photos from the job site will show up here as work gets going.</p>
    </HubCard>
  );
  const history = (
    <div key="history" className="space-y-5">
      <ProjectHistoryTimeline detail={detail} docBase={docBase} />
      <ContractBlock detail={detail} />
      <ApprovedSelectionsCard detail={detail} docBase={docBase} />
    </div>
  );
  const documents = <HubDocumentsCard key="documents" detail={detail} docBase={docBase} signUrls={signUrls} />;
  const rest = [
    <ScopeCard key="scope" detail={detail} />,
    photos ? <div key="photos">{photos}</div> : null,
    messages ? <div key="messages">{messages}</div> : null,
    <ActivityCard key="activity" detail={detail} />,
  ];

  return (
    <div className="space-y-6">
      {/* Contractor brand + contact */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <HubLogo path={detail.business.logo_url} signUrls={signUrls} className="h-11 w-11" />
          <p className="truncate text-lg font-bold text-foreground">{detail.business.company_name ?? "Your contractor"}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 font-semibold">
                <Phone className="h-4 w-4" /> Contact
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <ContactDetails detail={detail} />
            </PopoverContent>
          </Popover>
          {goToMessages && (
            <Button className="h-10 font-semibold" onClick={goToMessages}>
              <MessageCircle className="h-4 w-4" /> Message
            </Button>
          )}
        </div>
      </div>

      <HeaderBand detail={detail} signUrls={signUrls} />

      {twoCol ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(300px,360px)] items-start gap-6">
          <div className="min-w-0 space-y-5">{[progress, history, documents, ...rest]}</div>
          {/* Sticky side column; scrolls on its own only if taller than the window. */}
          <aside className="sticky top-6 max-h-[calc(100vh-3rem)] space-y-5 overflow-y-auto overscroll-contain rounded-card pb-1" aria-label="Summary">
            {complete ? [items.length ? attention : null, care, balance, contact] : [attention, balance, schedule, contact]}
          </aside>
        </div>
      ) : (
        <div className="space-y-5">{[attention, care, balance, progress, history, documents, schedule, ...rest, contact]}</div>
      )}
    </div>
  );
}

const TONE_DOT: Record<HubTone, string> = {
  green: "bg-success",
  amber: "bg-warning-strong",
  red: "bg-destructive",
  blue: "bg-info",
  gray: "bg-muted-subtle",
};

/** Cover photo (or a quiet branded placeholder), project name, address,
 * status, and the one-line "What's next". */
function HeaderBand({ detail, signUrls }: { detail: PortalProjectDetail; signUrls: SignUrls }) {
  const cover = useSignedUrl(coverPhotoPath(detail), signUrls);
  const [zoom, setZoom] = useState(false);
  const next = whatsNext(detail);
  const phase = portalProjectPhase(detail.project);
  return (
    <section className="card-surface overflow-hidden !p-0">
      {cover ? (
        <button type="button" onClick={() => setZoom(true)} className={cn("block h-56 w-full bg-muted lg:h-72", focusRing)} aria-label="Enlarge project photo">
          <img src={cover} alt="" className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-28 items-center justify-center bg-gradient-to-br from-primary/15 via-muted/60 to-muted lg:h-32" aria-hidden>
          <HubLogo path={detail.business.logo_url} signUrls={signUrls} className="h-16 w-16 opacity-80" />
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl">{detail.project.name}</h1>
          {detail.project.address && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" /> {detail.project.address}
            </p>
          )}
          <p className="mt-4 flex items-start gap-2 text-base text-foreground">
            <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", TONE_DOT[next.tone])} aria-hidden />
            <span>
              <span className="font-bold">What's next: </span>
              {next.text}
            </span>
          </p>
        </div>
        <TonePill tone={phaseTone(detail)} className="px-3 py-1 text-sm">
          {PORTAL_PHASE_LABEL[phase]}
        </TonePill>
      </div>
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-4xl p-2">
          <DialogTitle className="sr-only">Project photo</DialogTitle>
          {cover && <img src={cover} alt="" className="max-h-[85vh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ScopeCard({ detail }: { detail: PortalProjectDetail }) {
  const sections = projectScopeSections(detail);
  if (!sections.length) return null;
  return (
    <HubCard
      title={
        <span className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-subtle" /> What we're building
        </span>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map(({ s, tag }) => (
          <div key={s.id}>
            <p className="text-sm font-bold text-foreground">
              {s.name}
              {tag && <span className="ml-1.5 text-xs font-semibold text-muted-subtle">{tag}</span>}
            </p>
            <ul className="mt-1 space-y-1">
              {s.items
                .filter((i) => !(s.is_optional || i.is_optional) || i.client_selected)
                .map((i) => (
                  <li key={i.id} className="text-sm text-muted-foreground">
                    {i.name}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </HubCard>
  );
}

function ActivityCard({ detail }: { detail: PortalProjectDetail }) {
  const [all, setAll] = useState(false);
  if (!detail.events.length) return null;
  const shown = all ? detail.events : detail.events.slice(0, 6);
  return (
    <HubCard title="Activity">
      <ul className="space-y-2.5">
        {shown.map((e) => (
          <li key={e.id} className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-foreground">{e.summary}</span>
            <span className="shrink-0 text-xs text-muted-subtle">{hubDate(e.created_at)}</span>
          </li>
        ))}
      </ul>
      {detail.events.length > 6 && (
        <button type="button" onClick={() => setAll((v) => !v)} className={cn("mt-3 rounded text-sm font-semibold text-primary hover:underline", focusRing)}>
          {all ? "Show less" : `Show all ${detail.events.length}`}
        </button>
      )}
    </HubCard>
  );
}

/** Empty-state tile for the Hub's Photos card. */
export function NoPhotosYet() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <ImageIcon className="h-4 w-4 text-muted-subtle" /> No photos shared yet. Snap a site condition or question and send it to your contractor.
    </p>
  );
}
