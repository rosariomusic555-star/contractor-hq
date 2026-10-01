import { useQuery } from "@tanstack/react-query";
import { listCategories } from "@/lib/api";
import { isCatchAllCategoryName } from "@/lib/features";

/**
 * The contractor's Project types (Settings › Categories, in their own
 * sort_order, custom types included) as the type pickers offer them. The
 * catch-all ("Other / Uncategorized") isn't a feature, so it's left out.
 * One source for every "pick this job's types" control (ProjectTypeList),
 * so the New Opportunity modal and the opportunity/project pages can't
 * drift apart.
 */
export function useProjectTypeOptions() {
  const { data: categories = [], ...rest } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  return { options: categories.filter((c) => !isCatchAllCategoryName(c.name)), all: categories, ...rest };
}
