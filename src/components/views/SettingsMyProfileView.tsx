import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, UserRound } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useMyName, useUserProfile } from "@/hooks/use-my-name";
import { useAuth } from "@/lib/auth";
import { getSignedImageUrls, saveUserProfile, uploadAvatar, type UserProfile } from "@/lib/api";

const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";
const FIELD_INPUT = "h-11 rounded-xl border-transparent bg-muted px-3.5 focus-visible:border-primary focus-visible:bg-card";

/**
 * Settings › My profile — the signed-in owner's own name, phone and photo
 * (user_profiles, 0170), separate from the business profile. The name is
 * what the Dashboard greets them by and what the sidebar shows.
 */
export function SettingsMyProfileView() {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const me = useMyName();
  const { data, isLoading } = useUserProfile();
  const tableMissing = data === "missing";
  const saved: UserProfile = {
    first_name: (data && data !== "missing" ? data.first_name : null) ?? (me.firstName || null),
    last_name: (data && data !== "missing" ? data.last_name : null) ?? (me.lastName || null),
    phone: data && data !== "missing" ? data.phone : null,
    avatar_path: data && data !== "missing" ? data.avatar_path : null,
  };

  const [draft, setDraft] = useState<UserProfile>(saved);
  const dirty = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dirty.current) return;
    setDraft(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, me.firstName, me.lastName]);

  const edit = (patch: Partial<UserProfile>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };

  const refresh = async () => {
    // The name is also on the session (auth metadata): pick it up now.
    await qc.invalidateQueries({ queryKey: ["user-profile"] });
  };

  const { data: photoUrls = {} } = useQuery({
    queryKey: ["signed-image", saved.avatar_path],
    queryFn: () => getSignedImageUrls([saved.avatar_path!]),
    enabled: !!saved.avatar_path,
  });
  const photoUrl = saved.avatar_path ? photoUrls[saved.avatar_path] : null;

  const photoMut = useMutation({
    mutationFn: async (file: File | null) => {
      if (!session?.user.id) throw new Error("Not signed in.");
      if (tableMissing) throw new Error("Photos need a database update first.");
      const path = file ? await uploadAvatar(session.user.id, file) : null;
      // Only the photo changes here — the saved name / phone, not the draft.
      await saveUserProfile({ ...saved, avatar_path: path });
    },
    onSuccess: refresh,
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const problem = !draft.first_name?.trim() ? "Add your first name." : null;

  const saveMut = useMutation({
    mutationFn: () => saveUserProfile({ ...draft, avatar_path: saved.avatar_path }, { tableMissing }),
    onSuccess: async () => {
      dirty.current = false;
      await refresh();
      toast({ title: "Profile saved" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  useUnsavedChangesGuard(
    dirty.current,
    () => saveMut.mutate(),
    () => {
      dirty.current = false;
      setDraft(saved);
    },
    saveMut.isPending,
  );

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="My profile" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">My profile</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <UserRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <span className="text-[15px] font-bold text-background">About you</span>
            <p className="text-xs text-background/80">Your own name, not the company's. It's what the Dashboard greets you by.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 bg-card p-5 md:grid-cols-2">
          {!tableMissing && (
            <div className="space-y-1.5 md:col-span-2">
              <div className={FIELD_LABEL}>
                Photo <span className="normal-case text-muted-foreground">(optional)</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => photoInput.current?.click()}
                  disabled={photoMut.isPending || isLoading}
                  aria-label={photoUrl ? "Change photo" : "Add a photo"}
                  className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-dashed border-border bg-muted text-muted-subtle transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {photoMut.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : photoUrl ? (
                    <img src={photoUrl} alt="Your photo" className="h-full w-full object-cover" />
                  ) : me.hasName ? (
                    <span className="text-base font-bold text-foreground">{me.initials}</span>
                  ) : (
                    <ImagePlus className="h-5 w-5" />
                  )}
                </button>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) photoMut.mutate(file);
                  }}
                />
                {saved.avatar_path ? (
                  <Button type="button" variant="ghost" size="sm" disabled={photoMut.isPending} onClick={() => photoMut.mutate(null)}>
                    Remove photo
                  </Button>
                ) : (
                  <p className="text-[11px] text-muted-subtle">Square images work best.</p>
                )}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="me-first" className={FIELD_LABEL}>
              First name
            </label>
            <Input id="me-first" autoComplete="given-name" value={draft.first_name ?? ""} onChange={(e) => edit({ first_name: e.target.value })} className={FIELD_INPUT} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="me-last" className={FIELD_LABEL}>
              Last name
            </label>
            <Input id="me-last" autoComplete="family-name" value={draft.last_name ?? ""} onChange={(e) => edit({ last_name: e.target.value })} className={FIELD_INPUT} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="me-phone" className={FIELD_LABEL}>
              Phone <span className="normal-case text-muted-foreground">(optional)</span>
            </label>
            <Input id="me-phone" type="tel" autoComplete="tel" value={draft.phone ?? ""} onChange={(e) => edit({ phone: e.target.value })} className={FIELD_INPUT} disabled={tableMissing} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="me-email" className={FIELD_LABEL}>
              Email
            </label>
            <Input id="me-email" value={session?.user.email ?? ""} readOnly disabled className={FIELD_INPUT} />
            <p className="text-[11px] text-muted-subtle">The email you sign in with.</p>
          </div>
        </div>
      </div>

      {problem && dirty.current && (
        <p role="alert" className="text-right text-sm font-semibold text-destructive">
          {problem}
        </p>
      )}
      <div className="flex justify-end">
        <Button className="h-11 rounded-xl font-bold" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || isLoading || !!problem}>
          {saveMut.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
