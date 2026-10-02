/**
 * The material category every built-in template line comes in with (0162),
 * by category NAME — resolved to the contractor's own category of that name
 * (case-insensitive) when a section is created or the calculator adds a
 * line. Names match the default list (0094 + the seven added by 0162). A
 * contractor's own choice in Settings › Smart Section templates wins; a
 * name they've renamed or deleted resolves to nothing (Uncategorized).
 */
export const DEFAULT_SLOT_CATEGORIES: Record<string, Record<string, string>> = {
  paver_patio: {
    pavers: "Pavers",
    border_pavers: "Pavers",
    base_material: "Base Gravel",
    bedding_sand: "Bedding Sand",
    geotextile_fabric: "Fabric",
    edge_restraint: "Edging",
    polymeric_sand: "Polymeric Sand",
  },
  outdoor_kitchen: {
    wall_block_veneer: "Wall Block",
    concrete_block_core: "Concrete & Masonry",
    rebar: "Concrete & Masonry",
    concrete_mix_mortar: "Adhesive",
    countertop_material: "Other",
    construction_adhesive: "Adhesive",
    caps: "Caps",
    backsplash: "Wall Block",
  },
  seating_wall: {
    wall_block: "Wall Block",
    caps: "Caps",
    base_material: "Base Gravel",
    drainage_gravel: "Base Gravel",
    construction_adhesive: "Adhesive",
    backrest_caps: "Caps",
  },
  fire_pit: {
    wall_block: "Wall Block",
    caps: "Caps",
    base_material: "Base Gravel",
    crushed_stone_interior_fill: "Base Gravel",
    fire_brick_fire_ring_liner: "Concrete & Masonry",
    construction_adhesive: "Adhesive",
  },
  fireplace: {
    footing: "Concrete & Masonry",
    cmu_core: "Concrete & Masonry",
    firebox: "Concrete & Masonry",
    flue: "Concrete & Masonry",
    veneer: "Wall Block",
    mortar: "Adhesive",
    chimney_cap: "Caps",
  },
  outdoor_lighting: {
    light_fixtures: "Lighting",
    low_voltage_wire: "Lighting",
    transformer: "Lighting",
    wire_connectors: "Lighting",
    mounting_stakes_hardware: "Lighting",
    strip_lighting: "Lighting",
  },
  pergola: {
    posts: "Lumber & Hardware",
    beams: "Lumber & Hardware",
    rafters: "Lumber & Hardware",
    purlins: "Lumber & Hardware",
    footings: "Concrete & Masonry",
    hardware: "Lumber & Hardware",
  },
  water_feature: {
    liner: "Water Feature",
    underlayment: "Fabric",
    pump: "Water Feature",
    plumbing: "Water Feature",
    stone: "Stone & Gravel",
    gravel: "Stone & Gravel",
  },
  sod: {
    sod: "Plants & Soil",
    topsoil: "Plants & Soil",
    fertilizer: "Plants & Soil",
  },
  irrigation: {
    heads: "Irrigation",
    pipe: "Irrigation",
    valves: "Irrigation",
    controller: "Irrigation",
    backflow: "Irrigation",
    fittings: "Irrigation",
  },
  plants: {
    trees: "Plants & Soil",
    shrubs: "Plants & Soil",
    perennials: "Plants & Soil",
    mulch: "Plants & Soil",
    amendment: "Plants & Soil",
  },
};
