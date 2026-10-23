/** Task file id (UUID-shaped, as the task store requires) of the page-sample image saved for one render step. */
export const renderFileId = (step: number): string => `00000000-0000-4000-8000-${step.toString(16).padStart(12, "0")}`;
