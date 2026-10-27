/** CI-only substitute for private host skill storage. No user data is available. */
export async function listSkillsForUser(..._args: unknown[]): Promise<never> {
  throw new Error("Host skill registry unavailable in isolated tests");
}
