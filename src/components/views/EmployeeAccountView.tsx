import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { BackLink } from "@/components/common/BackLink";

/** The employee's only "settings" screen — self-service password change.
 * No forced-change-on-first-login flow for V1 (flagged optional in the
 * ask); this is the cheap version of the same hygiene concern. */
export function EmployeeAccountView() {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast({ title: "Couldn't update password", description: error.message, variant: "destructive" });
      return;
    }
    setPassword("");
    setConfirm("");
    toast({ title: "Password updated" });
  };

  return (
    <div className="animate-fade-in space-y-5">
      <BackLink
        to="/employee"
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >My projects</BackLink>
      <h1 className="text-[22px] font-bold tracking-tight text-foreground">Change password</h1>

      <form onSubmit={handleSubmit} className="stat-card space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <Button type="submit" disabled={submitting} className="w-full font-bold">
          {submitting ? "Saving…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
