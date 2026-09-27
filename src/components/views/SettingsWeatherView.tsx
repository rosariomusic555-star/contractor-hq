import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { getWeatherRiskSettings, saveWeatherRiskSettings, type WeatherRiskSettings } from "@/lib/api";

const TOGGLES: { key: "weather_flag_thunder" | "weather_flag_freeze" | "weather_flag_heat"; label: string; hint: string }[] = [
  { key: "weather_flag_thunder", label: "Thunderstorms", hint: "Flag a work day when thunderstorms are in the forecast" },
  { key: "weather_flag_freeze", label: "Snow & freezing temps", hint: "Snow, sleet or freezing rain; a low at or below 32°F; or a high under 40°F" },
  { key: "weather_flag_heat", label: "Extreme heat", hint: "Flag a work day when the high reaches the temperature below" },
];

/**
 * Settings › Schedule & weather (0119) — when a scheduled work day counts
 * as "risky" on the project Schedule card, the Bookings calendar, the
 * Dashboard and appointments. Rain chance is measured over the crew's work
 * hours (Settings › Business profile).
 */
export function SettingsWeatherView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useQuery({ queryKey: ["weather-risk-settings"], queryFn: getWeatherRiskSettings });
  const [pct, setPct] = useState("");
  const [inches, setInches] = useState("");
  const [heatF, setHeatF] = useState("");
  useEffect(() => {
    if (!settings) return;
    setPct(String(settings.weather_rain_pct));
    setInches(String(settings.weather_rain_in));
    setHeatF(String(settings.weather_heat_f));
  }, [settings]);

  const save = useMutation({
    mutationFn: (patch: Partial<WeatherRiskSettings>) => saveWeatherRiskSettings(patch),
    onMutate: (patch) => qc.setQueryData(["weather-risk-settings"], (old: WeatherRiskSettings | undefined) => (old ? { ...old, ...patch } : old)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["weather-risk-settings"] });
      // Thresholds ride along with every forecast response — refetch (the
      // server-side weather cache makes this cheap).
      qc.invalidateQueries({ queryKey: ["forecast"] });
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });

  const pctN = Number(pct);
  const inN = Number(inches);
  const heatN = Number(heatF);
  const valid = Number.isInteger(pctN) && pctN >= 1 && pctN <= 100 && inN > 0 && inN <= 10 && Number.isInteger(heatN) && heatN >= 70 && heatN <= 130;
  const dirty =
    !!settings && (pctN !== settings.weather_rain_pct || inN !== settings.weather_rain_in || heatN !== settings.weather_heat_f);

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Schedule & weather" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Schedule & weather</h1>
      </div>

      <section className="card-surface space-y-3 p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Rain risk</h2>
        <p className="text-xs text-muted-foreground">
          A scheduled work day is flagged when either is reached. Rain chance is the highest hourly chance during your crew hours (set in{" "}
          <Link to="/settings/business-profile" className="font-semibold text-primary hover:text-primary/80">
            Business profile
          </Link>
          ); the amount is the whole day's expected rain.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Rain chance at or above (%)</span>
            <Input inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value)} className="mt-1" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Expected rain at or above (inches)</span>
            <Input inputMode="decimal" value={inches} onChange={(e) => setInches(e.target.value)} className="mt-1" />
          </label>
        </div>
        <p className="text-[11px] text-muted-subtle">Red instead of amber at 80%+ or double the amount.</p>
      </section>

      <section className="card-surface p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Other flags</h2>
        <div className="mt-2 divide-y divide-hairline">
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex cursor-pointer items-center justify-between gap-4 py-3.5">
              <div>
                <div className="text-sm font-semibold text-foreground">{t.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t.hint}</div>
              </div>
              <Switch checked={!!settings?.[t.key]} disabled={!settings} onCheckedChange={(v) => save.mutate({ [t.key]: v })} />
            </label>
          ))}
        </div>
        <label className="mt-1 block max-w-[220px]">
          <span className="text-xs font-semibold text-muted-foreground">Extreme heat at or above (°F)</span>
          <Input inputMode="numeric" value={heatF} onChange={(e) => setHeatF(e.target.value)} className="mt-1" disabled={!settings?.weather_flag_heat} />
        </label>
      </section>

      {!valid && <p className="text-xs text-destructive">Rain chance 1–100%, rain amount above 0 in, heat 70–130°F (whole numbers for % and °F).</p>}
      <div className="flex justify-end">
        <Button
          disabled={!dirty || !valid || save.isPending}
          onClick={() => save.mutate({ weather_rain_pct: pctN, weather_rain_in: inN, weather_heat_f: heatN })}
        >
          Save
        </Button>
      </div>

      <p className="text-center text-[11px] text-muted-subtle">
        Forecasts from the National Weather Service (US addresses). Morning alerts for newly risky days are in{" "}
        <Link to="/settings/notifications" className="font-semibold text-primary hover:text-primary/80">
          Notifications
        </Link>
        .
      </p>
    </div>
  );
}
