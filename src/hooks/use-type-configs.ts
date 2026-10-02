import { useQuery } from "@tanstack/react-query";
import { listCategories, listTypeConfigs } from "@/lib/api";
import { setTypeConfigs } from "@/lib/typeConfig";

/**
 * Loads this contractor's custom project type setups (0159) and fills the
 * typeConfig registry, so measurement cards, Cost plan seeding, the
 * calculator and Quick Quote find a set-up type by its "cfg:<id>". Mounted
 * once in AppLayout; any screen can also call it to read the list. Returns
 * a version number that changes whenever the registry does.
 */
export function useTypeConfigs() {
  const { data: configs = [], dataUpdatedAt } = useQuery({ queryKey: ["type-configs"], queryFn: listTypeConfigs });
  const { data: categories = [], dataUpdatedAt: catsAt } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  // Registered during render (not only in an effect) so the first paint of
  // a card already sees its setup.
  setTypeConfigs(
    configs.map((config) => ({ config, label: categories.find((c) => c.id === config.category_id)?.name ?? "Custom type" })),
  );
  return { configs, version: dataUpdatedAt + catsAt };
}

/** Mount once inside the signed-in shell (AppLayout). */
export function TypeConfigsLoader() {
  useTypeConfigs();
  return null;
}
