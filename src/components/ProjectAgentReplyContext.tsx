"use client";

import { createContext } from "react";

/** Resolve when the host accepts a reply; reject to keep the input retryable. */
export type ReplyHandler = (text: string) => void | Promise<void>;
export const ReplyContext = createContext<ReplyHandler | null>(null);
export const ProjectAgentReplyProvider = ReplyContext.Provider;
