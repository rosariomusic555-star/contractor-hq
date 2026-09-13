/**
 * Smart Section — a template builder, not a calculator. Picking a build
 * type creates a new Materials Sheet section pre-populated with the line
 * item *names* a contractor would normally type out by hand for that kind
 * of job. No quantities, no prices, no product picks — those stay blank
 * for the contractor to fill in exactly as if they'd typed the line
 * manually. Adding a new build type is a new array entry here, not new
 * component logic.
 */
export interface SmartSectionTemplate {
  id: string;
  label: string;
  lineItems: string[];
}

export const SMART_SECTION_TEMPLATES: SmartSectionTemplate[] = [
  {
    id: "paver_patio",
    label: "Paver Patio",
    lineItems: [
      "Pavers",
      "Border/Edge Pavers",
      "Base Material",
      "Bedding Sand",
      "Geotextile Fabric",
      "Edge Restraint",
      "Polymeric Sand",
    ],
  },
  {
    id: "outdoor_kitchen",
    label: "Outdoor Kitchen",
    lineItems: [
      "Wall Block / Veneer",
      "Concrete Block (Core)",
      "Rebar",
      "Concrete Mix / Mortar",
      "Countertop Material",
      "Construction Adhesive",
      "Caps",
    ],
  },
  {
    id: "seating_wall",
    label: "Seating Wall",
    lineItems: ["Wall Block", "Caps", "Base Material", "Drainage Gravel", "Construction Adhesive"],
  },
  {
    id: "fire_pit",
    label: "Fire Pit",
    lineItems: [
      "Wall Block",
      "Caps",
      "Base Material",
      "Crushed Stone / Interior Fill",
      "Fire Brick / Fire Ring Liner",
      "Construction Adhesive",
    ],
  },
  {
    id: "outdoor_lighting",
    label: "Outdoor Lighting",
    lineItems: [
      "Light Fixtures",
      "Low-Voltage Wire",
      "Transformer",
      "Wire Connectors",
      "Mounting Stakes/Hardware",
    ],
  },
];
