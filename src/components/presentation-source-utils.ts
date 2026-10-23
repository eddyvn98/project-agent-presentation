import type { ProjectAgentTaskSource } from "@/lib/project-agent/types";

/** Relative assets and ordinary web URLs only; never executable or credential-bearing URLs. */
export function safePresentationUrl(value: string): boolean {
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value) || value.startsWith("//")) return false;
  if (!/^[a-z][a-z\d+.-]*:/i.test(value)) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

export function presentationSourceUrl(value: string): URL | null {
  if (!safePresentationUrl(value) || !/^https?:\/\//i.test(value)) return null;
  try { return new URL(value); } catch { return null; }
}

/** Show a supplied ISO calendar date without assigning a timezone or inventing a date. */
export function presentationSourceDate(value?: string): string | null {
  const date = value?.match(/^\d{4}-\d{2}-\d{2}(?=$|T|\s)/)?.[0];
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

export function uniquePresentationSources(sources: ProjectAgentTaskSource[]): ProjectAgentTaskSource[] {
  const unique = new Map<string, ProjectAgentTaskSource>();
  for (const source of sources) {
    const url = presentationSourceUrl(source.url);
    if (!url) continue;
    url.hash = "";
    const key = url.href;
    const previous = unique.get(key);
    unique.set(key, previous ? {
      ...previous, title: previous.title || source.title,
      excerpt: previous.excerpt || source.excerpt,
      publishedAt: previous.publishedAt || source.publishedAt,
    } : source);
  }
  return [...unique.values()];
}
