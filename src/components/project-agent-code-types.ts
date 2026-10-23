import type { ReactNode } from "react";

export type ProjectAgentCodeSaveChange = { originalCode: string; language: string; code: string };
export type ProjectAgentCodeSaveHandler = (change: ProjectAgentCodeSaveChange) => void | Promise<void>;
export type ProjectAgentCodePreviewInput = { code: string; language: string };
export type ProjectAgentCodePreviewRenderer = (block: ProjectAgentCodePreviewInput) => ReactNode;

export interface ProjectAgentCodeBlockProps {
  language: string;
  code: string;
  streaming?: boolean;
  /** The host owns persistence; reject if the edit cannot be accepted. */
  onSave?: ProjectAgentCodeSaveHandler;
  /** Render a trusted host preview. The presentation package never executes source code. */
  renderPreview?: ProjectAgentCodePreviewRenderer;
}
