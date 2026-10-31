/** Helpers for AI-suspected findings. The analyzer writes its suggested severity into the description. */

export const SEVERITIES = ["low", "moderate", "severe"] as const;
export type Severity = (typeof SEVERITIES)[number];

export function suggestedSeverity(description: string): Severity {
  const match = /Suggested severity:\s*(low|moderate|severe)/i.exec(description);
  return (match?.[1]?.toLowerCase() as Severity | undefined) ?? "moderate";
}
