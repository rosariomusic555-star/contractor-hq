import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSectionCollapse } from "@/hooks/use-section-collapse";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { CollapseAllLinks } from "@/components/common/CollapseAllLinks";
import { CollapsibleBody } from "@/components/common/CollapsibleBody";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { FeatureCard } from "@/components/measurements/FeatureCard";
import {
  createProjectFeature,
  ensureFeatureSections,
  listCategories,
  listFeatureMeasurements,
  listProjectFeatures,
  updateProjectFeature,
  listProjectMeasurements,
  listSmartSectionSettings,
  saveProjectMeasurements,
} from "@/lib/api";
import { liveFeatures } from "@/lib/features";
import { findSmartSectionSettings, findSmartSectionTemplate, resolveTunableValue } from "@/lib/smartSections";
import {
  DEFAULT_FIRE_PIT_HEIGHT_IN,
  DEFAULT_KITCHEN_HEIGHT_IN,
  buildTypeForCategoryName,
  FIRE_PIT_HEIGHT_TUNABLE,
  KITCHEN_HEIGHT_TUNABLE,
  GENERAL_GROUP,
  GENERAL_GROUP_KEY,
  blankData,
  computeTotals,
  featureKindOf,
  featureSummary,
  groupHasData,
  groupKeyOf,
  instanceHasData,
  measurementGroupsFor,
  newCustomFieldKey,
  newId,
  normalizeData,
  totalSurfaceSqft,
  type FeatureData,
  type FeatureInstance,
  type MeasurementDefaults,
  type MeasurementGroup,
  type MeasurementRow,
} from "@/lib/measurements";

// Stable empty defaults — a fresh [] per render would re-fire the reseed effect forever.
const NO_INSTANCES: FeatureInstance[] = [];
const NO_ROWS: MeasurementRow[] = [];

/**
 * The project's measurements: one purpose-built card per selected Project
 * type (src/components/measurements/*), custom label/qty/unit rows as a
 * secondary option on each. Shared by the project page and the opportunity
 * page, so both read and write the same rows:
 *   project_feature_measurements (0098) — typed instances + computed totals
 *   project_measurements (0091)         — custom measurements
 *
 * Draft + explicit Save (the app's editor convention): edits stay local
 * until Save, which diffs against the stored rows. `ensureProjectId` covers
 * the opportunity page before its project exists — the first save lazily
 * creates it, same as the first photo/sheet/quote there.
 *
 * Deselecting a Project type only hides its card; the data stays and comes
 * back when it's re-added (the type pickers confirm first — see
 * useConfirmTypeRemoval).
 */
export function ProjectMeasurementsCard({
  projectId,
  categoryIds,
  ensureProjectId,
  onSaved,
  hint,
  focusRequest = 0,
}: {
  projectId: string | null;
  /** The selected Project types (Job Category ids). */
  categoryIds: string[];
  ensureProjectId?: () => Promise<string>;
  onSaved?: () => void;
  /** Small muted guidance under the title (the opportunity page uses it to
   * say when to fill this in). */
  hint?: string;
  /** Bump to open the card, scroll to it and focus its first field (the
   * opportunity banner's "Add measurements"). */
  focusRequest?: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: categories = [], isSuccess: categoriesLoaded } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: serverInstances = NO_INSTANCES, isSuccess: instancesLoaded } = useQuery({
    queryKey: ["project-feature-measurements", projectId],
    queryFn: () => listFeatureMeasurements(projectId!),
    enabled: !!projectId,
  });
  const { data: serverCustom = NO_ROWS, isSuccess: customLoaded } = useQuery({
    queryKey: ["project-measurements", projectId],
    queryFn: () => listProjectMeasurements(projectId!),
    enabled: !!projectId,
  });
  const { data: smartSettings = [] } = useQuery({ queryKey: ["smart-section-settings"], queryFn: listSmartSectionSettings });
  // Contractor default heights live as Smart Section tunables (Settings ›
  // Smart Section templates).
  const tunable = (buildType: string, key: string, fallback: number) => {
    const template = findSmartSectionTemplate(buildType);
    return template ? resolveTunableValue(template, findSmartSectionSettings(smartSettings, buildType), key) || fallback : fallback;
  };
  const defaults: Required<MeasurementDefaults> = {
    firePitHeightIn: tunable("fire_pit", FIRE_PIT_HEIGHT_TUNABLE, DEFAULT_FIRE_PIT_HEIGHT_IN),
    kitchenHeightIn: tunable("outdoor_kitchen", KITCHEN_HEIGHT_TUNABLE, DEFAULT_KITCHEN_HEIGHT_IN),
  };

  const [instances, setInstances] = useState<FeatureInstance[]>([]);
  const [custom, setCustom] = useState<MeasurementRow[]>([]);
  const dirty = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const markDirty = () => {
    dirty.current = true;
    setIsDirty(true);
  };
  const reseed = () => {
    setInstances(
      serverInstances
        .filter((i) => featureKindOf(i.build_type))
        .map((i) => ({ ...i, data: normalizeData(featureKindOf(i.build_type)!, i.data) })),
    );
    setCustom(serverCustom.map((r) => ({ ...r })));
    blanks.current = {};
    dirty.current = false;
    setIsDirty(false);
  };
  useEffect(() => {
    if (!dirty.current) reseed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverInstances, serverCustom]);

  const typeGroups = useMemo(() => measurementGroupsFor(categoryIds, categories), [categoryIds, categories]);
  const hasGeneralRows = custom.some((r) => groupKeyOf(r) === GENERAL_GROUP_KEY);
  const groups: MeasurementGroup[] =
    hasGeneralRows || typeGroups.length === 0 ? [...typeGroups, GENERAL_GROUP] : typeGroups;

  // Every card shows at least one instance to type into. Until it's edited
  // it's a placeholder (not in the draft), cached per group so its ids —
  // and so the inputs' React keys — stay stable while typing.
  const blanks = useRef<Record<string, FeatureInstance>>({});
  const newInstance = (g: MeasurementGroup): FeatureInstance => ({
    id: newId(),
    project_id: projectId ?? "",
    build_type: g.build_type!,
    label: null,
    data: blankData(g.kind!),
    totals: {},
    sort_order: 0,
  });
  const instancesOf = (g: MeasurementGroup): FeatureInstance[] => {
    const own = instances.filter((i) => groupKeyOf(i) === g.key);
    if (own.length > 0 || !g.kind || !g.build_type) return own;
    blanks.current[g.key] ??= newInstance(g);
    return [blanks.current[g.key]];
  };

  const updateInstance = (g: MeasurementGroup, id: string, patch: { label?: string; data?: FeatureData }) => {
    markDirty();
    setInstances((list) => {
      if (list.some((i) => i.id === id)) return list.map((i) => (i.id === id ? { ...i, ...patch } : i));
      // First edit of the placeholder — it joins the draft.
      const blank = blanks.current[g.key];
      return blank?.id === id ? [...list, { ...blank, ...patch }] : list;
    });
  };

  const addInstance = (g: MeasurementGroup) => {
    if (!g.kind || !g.build_type) return;
    markDirty();
    const added = newInstance(g);
    setInstances((list) => {
      // Materialize the placeholder first so "+ Add another" always adds a second card.
      const blank = blanks.current[g.key];
      const hasOwn = list.some((i) => groupKeyOf(i) === g.key);
      return [...list, ...(!hasOwn && blank ? [blank] : []), added];
    });
  };

  const removeInstance = (g: MeasurementGroup, id: string) => {
    markDirty();
    if (blanks.current[g.key]?.id === id) delete blanks.current[g.key];
    setInstances((list) => list.filter((i) => i.id !== id));
  };

  const addCustom = (g: MeasurementGroup, patch: Partial<MeasurementRow> = {}) => {
    markDirty();
    setCustom((rows) => [
      ...rows,
      {
        id: newId(),
        project_id: projectId ?? "",
        build_type: g.build_type,
        category_id: g.category_id,
        field_key: newCustomFieldKey(),
        label: null,
        value: null,
        value_text: null,
        unit: "sq_ft",
        sort_order: rows.length,
        ...patch,
      },
    ]);
  };
  const updateCustom = (id: string, patch: Partial<MeasurementRow>) => {
    markDirty();
    setCustom((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const removeCustom = (id: string) => {
    markDirty();
    setCustom((rows) => rows.filter((r) => r.id !== id));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const id = projectId ?? (await ensureProjectId!());

      // Instances: drop empty ones, recompute totals, number them per group.
      const orderInGroup = new Map<string, number>();
      const keepInstances = instances
        .filter((i) => instanceHasData(featureKindOf(i.build_type)!, i.data, i.label))
        .map((i) => {
          const key = groupKeyOf(i);
          const sort_order = orderInGroup.get(key) ?? 0;
          orderInGroup.set(key, sort_order + 1);
          return {
            ...i,
            project_id: id,
            label: i.label?.trim() || null,
            totals: computeTotals(featureKindOf(i.build_type)!, i.data, defaults),
            sort_order,
          };
        });
      const serverInstById = new Map(serverInstances.map((i) => [i.id, i]));
      const keepInstIds = new Set(keepInstances.map((i) => i.id));
      // Instances of a build type without a card aren't loaded into the
      // draft — never delete those.
      const deleteInstanceIds = serverInstances
        .filter((i) => featureKindOf(i.build_type) && !keepInstIds.has(i.id))
        .map((i) => i.id);

      // Every measured instance is one project feature (0105): the first of
      // a type measures that type's feature, "+ Add another" makes a new
      // feature, removing an extra instance removes its feature, and the
      // instance's label is the feature's label. Skipped before 0105 (no
      // feature records).
      const features = await listProjectFeatures(id);
      let featuresAdded = false;
      if (features.length > 0) {
        const live = liveFeatures(features);
        const categoryFor = (bt: string) =>
          categoryIds.find((cid) => buildTypeForCategoryName(categories.find((c) => c.id === cid)?.name ?? "")?.id === bt) ?? null;
        const claimed = new Set(keepInstances.map((i) => i.feature_id).filter(Boolean) as string[]);
        for (const inst of keepInstances) {
          const own = inst.feature_id ? features.find((f) => f.id === inst.feature_id) : undefined;
          if (own) {
            if ((own.label ?? null) !== inst.label) await updateProjectFeature(own.id, { label: inst.label });
            continue;
          }
          const categoryId = categoryFor(inst.build_type);
          const free = live.find((f) => f.category_id === categoryId && !claimed.has(f.id));
          const feature = free ?? (await createProjectFeature(id, { category_id: categoryId, label: inst.label }));
          if (free && inst.label && free.label !== inst.label) await updateProjectFeature(free.id, { label: inst.label });
          if (!free) featuresAdded = true;
          claimed.add(feature.id);
          inst.feature_id = feature.id;
        }
        for (const removedId of deleteInstanceIds) {
          const f = features.find((x) => x.id === serverInstById.get(removedId)?.feature_id);
          const othersOfType = live.some((o) => o.id !== f?.id && o.category_id === f?.category_id);
          if (f && f.status !== "removed" && othersOfType) await updateProjectFeature(f.id, { status: "removed" });
        }
      }

      const changedInstances = keepInstances.filter((i) => JSON.stringify(i) !== JSON.stringify(serverInstById.get(i.id)));

      // Custom rows: empty = neither a label nor a value.
      const keepCustom = custom
        .filter((r) => !!r.label?.trim() || r.value != null)
        .map((r) => ({ ...r, project_id: id, label: r.label?.trim() || null }));
      const serverCustomById = new Map(serverCustom.map((r) => [r.id, r]));
      const keepCustomIds = new Set(keepCustom.map((r) => r.id));
      const changedCustom = keepCustom.filter((r) => JSON.stringify(r) !== JSON.stringify(serverCustomById.get(r.id)));
      const deleteCustomIds = serverCustom.filter((r) => !keepCustomIds.has(r.id)).map((r) => r.id);

      const visibleKeys = new Set(typeGroups.map((g) => g.key));
      await saveProjectMeasurements(
        id,
        { instances: changedInstances, deleteInstanceIds, customRows: changedCustom, deleteCustomIds },
        totalSurfaceSqft(keepInstances, visibleKeys),
      );
      if (featuresAdded) await ensureFeatureSections(id);
      return id;
    },
    onSuccess: (id) => {
      dirty.current = false;
      setIsDirty(false);
      qc.invalidateQueries({ queryKey: ["project-feature-measurements", id] });
      qc.invalidateQueries({ queryKey: ["project-measurements", id] });
      qc.invalidateQueries({ queryKey: ["project-features", id] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", id] });
      onSaved?.();
      toast({ title: "Measurements saved" });
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't save measurements", description: err.message, variant: "destructive" }),
  });

  // --- Collapse state (pure UI, localStorage, per signed-in user) ---------
  // The whole card is "card"; each feature is scoped to this project so two
  // jobs' patios don't share a state.
  const { session } = useAuth();
  const scope = projectId ?? "unsaved";
  const featureId = (g: MeasurementGroup) => `${scope}:${g.key}`;
  // A feature's default: collapsed if it already had saved measurements
  // when the page loaded, expanded if empty. Snapshotted once per feature,
  // so typing into an empty one (or saving it) never collapses it under you.
  // Categories too: until they load there are no type groups, and the
  // "just added" check below would otherwise see every type appear at once.
  const loaded = categoriesLoaded && (!projectId || (instancesLoaded && customLoaded));
  const hadDataAtLoad = useRef(new Map<string, boolean>());
  if (loaded) {
    for (const g of groups) {
      const id = featureId(g);
      if (!hadDataAtLoad.current.has(id)) hadDataAtLoad.current.set(id, groupHasData(g, serverInstances, serverCustom));
    }
  }
  const collapse = useSectionCollapse({
    storageKey: `chq_measurements_collapse_v1:${session?.user.id ?? "anon"}`,
    defaultCollapsed: (id) => hadDataAtLoad.current.get(id) ?? false,
  });

  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusRequest) return;
    collapse.expandAll(["card", ...(groups[0] ? [featureId(groups[0])] : [])]);
    // After the expand renders.
    const t = window.setTimeout(() => {
      const el = sectionRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      const field = el.querySelector<HTMLElement>("#measurements-card-body input, #measurements-card-body button[role=combobox]");
      (field ?? el.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // A type just added from the Project types selector opens expanded (and
  // opens the card too) — even a re-added one that still has data.
  const seenGroupKeys = useRef<Set<string> | null>(null);
  const groupKeysSig = groups.map((g) => g.key).join("|");
  useEffect(() => {
    if (!loaded) return;
    const keys = new Set(groups.map((g) => g.key));
    const prev = seenGroupKeys.current;
    seenGroupKeys.current = keys;
    if (!prev) return; // first render: defaults apply
    const added = groups.filter((g) => !prev.has(g.key));
    if (added.length === 0) return;
    collapse.expandAll(["card", ...added.map(featureId)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKeysSig, loaded]);

  const cardCollapsed = collapse.isCollapsed("card");
  const summaries = groups.map((g) =>
    featureSummary(g, instancesOf(g), custom.filter((r) => groupKeyOf(r) === g.key), defaults),
  );
  const measured = summaries.filter(Boolean).length;
  const cardSummary = [
    `${groups.length} ${groups.length === 1 ? "feature" : "features"}`,
    measured ? `${measured} measured` : null,
    groups.length - measured ? `${groups.length - measured} empty` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section ref={sectionRef} className="card-surface scroll-mt-4 p-4 sm:p-5">
      <button
        type="button"
        onClick={() => collapse.toggle("card")}
        aria-expanded={!cardCollapsed}
        aria-controls="measurements-card-body"
        className="-mx-2 -mt-2 flex min-h-12 w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-muted/40"
      >
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", cardCollapsed && "-rotate-90")} />
        <h3 className="text-base font-bold text-foreground">Measurements</h3>
        {cardCollapsed && groups.length > 0 && typeGroups.length > 0 && (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-muted-foreground">· {cardSummary}</span>
        )}
      </button>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}

      <CollapsibleBody collapsed={cardCollapsed} id="measurements-card-body">
        {typeGroups.length === 0 && (
          <p className="mt-1 text-xs text-muted-subtle">Pick a project type to get its measurement card.</p>
        )}

        {groups.length > 1 && (
          <div className="mt-3">
            <CollapseAllLinks
              onCollapseAll={() => collapse.collapseAll(groups.map(featureId))}
              onExpandAll={() => collapse.expandAll(groups.map(featureId))}
            />
          </div>
        )}

        <div className="mt-3 space-y-3">
          {groups.map((g) => (
            <FeatureCard
              collapsed={collapse.isCollapsed(featureId(g))}
              onToggleCollapse={() => collapse.toggle(featureId(g))}
              key={g.key}
              group={g}
              instances={instancesOf(g)}
              customRows={custom.filter((r) => groupKeyOf(r) === g.key)}
              defaults={defaults}
              onInstanceChange={(id, patch) => updateInstance(g, id, patch)}
              onAddInstance={() => addInstance(g)}
              onRemoveInstance={(id) => removeInstance(g, id)}
              onCustomChange={updateCustom}
              onAddCustom={(patch) => addCustom(g, patch)}
              onRemoveCustom={removeCustom}
            />
          ))}
        </div>

        <p className="mt-3 text-[11px] text-muted-subtle">
          Patio, walkway and driveway sq ft add up to the job size used by the Labor log (hours/100sf, cost/sf).
        </p>
      </CollapsibleBody>

      <DraftSaveBar
        visible={isDirty}
        onDiscard={reseed}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
        label="Unsaved measurements"
      />
    </section>
  );
}
