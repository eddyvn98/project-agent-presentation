"use client";

import { createContext } from "react";

/** Optional stable message identity for isolated, host-owned response state. */
export const ProjectAgentResponseContext = createContext<string | undefined>(undefined);
