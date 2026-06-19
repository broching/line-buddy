// Shared merge logic for collectedFields entries that may be plain scalars or
// composite values with auto-detected sub-fields (e.g. "roof description" →
// material/age/square_feet). A single mechanism — merge-by-subKey — gives both
// behaviors for free: re-stating the same subKey overrides it (scalar fields
// always use subKey="value", so every update is a full override); mentioning a
// new subKey appends a new attribute alongside the others without touching them.

export type SubFieldEntry = {
  label: string;
  value: string;
  confidence: number;
  extractedAt: number;
};

export type CollectedFieldValue = {
  value: string;
  confidence: number;
  extractedAt: number;
  subFields?: Record<string, SubFieldEntry>;
};

export type FieldComponent = {
  subKey: string;
  subLabel: string;
  value: string;
  confidence: number;
};

export function mergeFieldComponents(
  existing: CollectedFieldValue | undefined,
  components: FieldComponent[],
  now: number
): CollectedFieldValue {
  const prevSubFields: Record<string, SubFieldEntry> =
    existing?.subFields ??
    (existing
      ? {
          value: {
            label: "Value",
            value: String(existing.value),
            confidence: existing.confidence,
            extractedAt: existing.extractedAt,
          },
        }
      : {});

  const subFields = { ...prevSubFields };
  for (const c of components) {
    const subKey = c.subKey || "value";
    subFields[subKey] = {
      label: c.subLabel || subKey,
      value: c.value,
      confidence: c.confidence,
      extractedAt: now,
    };
  }

  const entries = Object.values(subFields);
  const isPlainScalar = entries.length === 1 && "value" in subFields;

  return {
    value: isPlainScalar ? subFields.value.value : entries.map((e) => e.value).join(", "),
    confidence: Math.min(...entries.map((e) => e.confidence)),
    extractedAt: now,
    subFields,
  };
}
