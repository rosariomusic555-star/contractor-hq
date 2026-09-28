import type { RawCalculatedLine, SmartSectionTemplate } from "./types";
import { numOr } from "./numOr";

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
  lineItemSlots: [
    { key: "light_fixtures", defaultName: "Light Fixtures" },
    { key: "low_voltage_wire", defaultName: "Low-Voltage Wire" },
    { key: "transformer", defaultName: "Transformer" },
    { key: "wire_connectors", defaultName: "Wire Connectors" },
    { key: "mounting_stakes_hardware", defaultName: "Mounting Stakes/Hardware" },
    { key: "strip_lighting", defaultName: "Strip Lighting", addOn: true },
  ],
  questions: [
    { key: "fixture_count", label: "Number of fixtures", type: "number", unit: "ea" },
    { key: "wire_run_ft", label: "Approximate total wire run", type: "number", unit: "ft" },
    { key: "strip_lf", label: "Strip lighting", type: "number", unit: "ft" },
  ],
  tunables: [
    {
      key: "wire_ft_per_roll",
      label: "Roll length",
      unit: "ft/roll",
      defaultValue: 250, // ASSUMPTION — common low-voltage landscape wire roll length
      relatedSlotKey: "low_voltage_wire",
    },
    {
      key: "connectors_per_fixture",
      label: "Connectors per fixture",
      unit: "ea",
      defaultValue: 1.5, // "roughly 1-2 per fixture" per spec
      relatedSlotKey: "wire_connectors",
    },
  ],
  calculate: (answers) => {
    const fixtureCount = Number(answers.fixture_count) || 0;
    const wireRunFt = Number(answers.wire_run_ft) || 0;
    const wireFtPerRoll = Number(answers.wire_ft_per_roll) || 250;
    const connectorsPerFixture = numOr(answers.connectors_per_fixture, 1.5);

    const lines: RawCalculatedLine[] = [
      { slotKey: "light_fixtures", quantity: fixtureCount, unit: "ea" },
      { slotKey: "low_voltage_wire", quantity: Math.ceil(wireRunFt / wireFtPerRoll), unit: "roll" },
      { slotKey: "transformer", quantity: 1, unit: "ea" },
      { slotKey: "wire_connectors", quantity: Math.ceil(fixtureCount * connectorsPerFixture), unit: "ea" },
      { slotKey: "mounting_stakes_hardware", quantity: fixtureCount, unit: "ea" },
    ];

    const stripLf = Number(answers.strip_lf) || 0;
    if (stripLf > 0) lines.push({ slotKey: "strip_lighting", quantity: Math.ceil(stripLf), unit: "ft" });
    // else: no strip lighting measured — line left untouched.

    return lines;
  },
};
