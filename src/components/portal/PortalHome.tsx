import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getPortalContext, recordPortalSignIn, type PortalProject } from "@/lib/portalApi";
import { PortalProjectPicker } from "./PortalProjectPicker";
import { usePortalAuth } from "@/lib/portalAuth";

interface PickerProject extends PortalProject {
  business_name: string | null;
}

/**
 * The hub's landing screen — decides where a signed-in client goes: no
 * matching projects (nothing to show), exactly one (straight there, no
 * picker), or several (PortalProjectPicker). This is where Phase 2 stops
 * being a stub — everything below "Coming soon" belongs to that phase.
 */
export function PortalHome() {
  const navigate = useNavigate();
  const { session, signOut } = usePortalAuth();

  useEffect(() => {
    void recordPortalSignIn();
  }, []);

  const { data: contexts, isLoading } = useQuery({
    queryKey: ["portal-context"],
    queryFn: getPortalContext,
  });

  const projects: PickerProject[] = (contexts ?? []).flatMap((c) =>
    c.projects.map((p) => ({ ...p, business_name: c.business_name })),
  );

  useEffect(() => {
    if (projects.length === 1) navigate(`/portal/projects/${projects[0].id}`, { replace: true });
  }, [projects, navigate]);

  if (isLoading || projects.length === 1) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-subtle" />
      </div>
    );
  }

  if (projects.length === 0) {
    // Signed in, but no client record has this email — say so plainly (and
    // offer another email) rather than bouncing back to the sign-in form.
    return (
      <div className="mx-auto max-w-sm space-y-3 py-16 text-center text-sm text-muted-foreground">
        <p className="text-base font-bold text-foreground">We couldn't find a project for this email</p>
        <p>
          You're signed in as <span className="font-semibold text-foreground">{session?.user.email}</span>. If your
          contractor has a different email on file, contact them — or sign in with another email.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  // mx-auto max-w-lg: the picker stays a narrow list on the wide desktop layout.
  return (
    <div className="mx-auto max-w-lg">
      <PortalProjectPicker projects={projects} />
    </div>
  );
}
