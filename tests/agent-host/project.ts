/** Fail closed: no fake authentication, projects or business data. */
export async function getProject(..._args: unknown[]): Promise<never> { throw new Error("Host project capability unavailable"); }
export async function listProjects(..._args: unknown[]): Promise<never> { throw new Error("Host project capability unavailable"); }
export function isHiddenProject(..._args: unknown[]): never { throw new Error("Host project capability unavailable"); }
