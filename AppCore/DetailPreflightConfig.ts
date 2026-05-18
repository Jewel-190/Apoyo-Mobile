/**
 * Radio preflight steps from `assistance_services.radio_selection` (JSONB).
 * Shape is CMS-defined; the app does not hardcode service-specific flows.
 */

export type DetailPreflightOption = {
  value: string;
  label: string;
};

export type DetailPreflightStep = {
  id: string;
  prompt: string;
  options: DetailPreflightOption[];
};

export type DetailPreflightConfig = {
  version: number;
  /** Optional HTML shown in the reminder panel above radio steps. */
  reminder_html?: string;
  steps: DetailPreflightStep[];
};

export function parseDetailPreflightConfig(
  raw: unknown
): DetailPreflightConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!Array.isArray(o.steps)) return null;

  const steps: DetailPreflightStep[] = [];
  for (let i = 0; i < o.steps.length; i++) {
    const item = o.steps[i];
    if (!item || typeof item !== "object") return null;
    const s = item as Record<string, unknown>;
    if (typeof s.prompt !== "string" || !s.prompt.trim()) return null;
    if (!Array.isArray(s.options)) return null;

    const stepId =
      typeof s.id === "string" && s.id.trim()
        ? s.id.trim()
        : `step_${i + 1}`;

    const options: DetailPreflightOption[] = [];
    for (const opt of s.options) {
      if (typeof opt === "string") {
        const text = opt.trim();
        if (!text) return null;
        options.push({ value: text, label: text });
        continue;
      }
      if (!opt || typeof opt !== "object") return null;
      const op = opt as Record<string, unknown>;
      const label =
        (typeof op.label === "string" ? op.label : "").trim() ||
        (typeof op.value === "string" ? op.value : "").trim();
      if (!label) return null;
      options.push({ value: label, label });
    }
    if (!options.length) return null;
    steps.push({ id: stepId, prompt: s.prompt.trim(), options });
  }

  if (!steps.length) return null;

  return {
    version: 1,
    reminder_html:
      typeof o.reminder_html === "string" ? o.reminder_html : undefined,
    steps,
  };
}
