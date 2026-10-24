/** Reject exact duplicate parallel jobs; do not infer semantic equality from similar wording. */
export function uniqueParallelJobs<T extends { task: string; role?: string }>(jobs: T[]): Array<{ job: T; index: number }> {
  const seen = new Set<string>();
  return jobs.flatMap((job, index) => {
    const key = JSON.stringify([job.role ?? "worker", job.task.trim().replace(/\s+/g, " ")]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ job, index }];
  });
}
