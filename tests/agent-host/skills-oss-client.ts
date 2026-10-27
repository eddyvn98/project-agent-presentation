/** CI-only substitute. Never contacts the private OSS. */
export function createSkillsOssClient() {
  return { async get(..._args: unknown[]): Promise<never> {
    throw new Error("Host skill object storage unavailable in isolated tests");
  } };
}
