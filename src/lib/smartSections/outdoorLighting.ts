import type { CalculatedLine, SmartSectionTemplate } from "./types";

// ASSUMPTION constants — flagged for verification.
const WIRE_FT_PER_ROLL = 250; // common low-voltage landscape wire roll length
const CONNECTORS_PER_FIXTURE = 1.5; // "roughly 1-2 per fixture" per spec

/**
 * Simplification: the spec mentions an optional "transformer size (or
 * recommend based on fixture count)" question, but sizing doesn't change
 * the generated line's *quantity* (always 1 transformer) and this app has
 * no Transformer catalog category to size against — so no question is
 * asked for it. The Transformer line is always quantity 1.
 */
export const outdoorLightingTemplate: SmartSectionTemplate = {
  id: "outdoor_lighting",
  label: "Outdoor Lighting",
  lineItems: ["Light Fixtures", "Low-Voltage Wire", "Transformer", "Wire Connectors", "Mounting Stakes/Hardware"],
  questions: [
    { key: "fixture_count", label: "Number of fixtures", type: "number", unit: "ea" },
    { key: "wire_run_ft", label: "Approximate total wire run", type: "number", unit: "ft" },
  ],
  calculate: (answers) => {
    const fixtureCount = Number(answers.fixture_count) || 0;
    const wireRunFt = Number(answers.wire_run_ft) || 0;

    const lines: CalculatedLine[] = [
      { name: "Light Fixtures", quantity: fixtureCount, unit: "ea" },
      { name: "Low-Voltage Wire", quantity: Math.ceil(wireRunFt / WIRE_FT_PER_ROLL), unit: "roll" },
      { name: "Transformer", quantity: 1, unit: "ea" },
      { name: "Wire Connectors", quantity: Math.ceil(fixtureCount * CONNECTORS_PER_FIXTURE), unit: "ea" },
      { name: "Mounting Stakes/Hardware", quantity: fixtureCount, unit: "ea" },
    ];

    return lines;
  },
};
