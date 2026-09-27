import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Star } from "lucide-react";
import { reviewClick } from "@/lib/api";

/**
 * /r/:token — the tracked review link (0122). Public: logs the click, then
 * sends the phone straight on to the contractor's review page (replace, so
 * Back doesn't bounce here again). The token reveals nothing else — the
 * server only ever returns the review URL.
 */
export default function ReviewRedirect() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "inactive" | { url: string }>("loading");

  useEffect(() => {
    let alive = true;
    const valid = token && /^[0-9a-f-]{36}$/i.test(token);
    (valid ? reviewClick(token) : Promise.resolve(null)).then((url) => {
      if (!alive) return;
      if (!url) return setState("inactive");
      setState({ url });
      window.location.replace(url);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <div className="max-w-sm space-y-3">
        <Star className="mx-auto h-8 w-8 text-warning" />
        {state === "inactive" ? (
          <p className="text-base font-semibold text-foreground">This review link isn't active anymore.</p>
        ) : (
          <>
            <p className="text-base font-semibold text-foreground">Taking you to the review page…</p>
            {typeof state === "object" && (
              <a href={state.url} className="inline-block rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">
                Continue
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
