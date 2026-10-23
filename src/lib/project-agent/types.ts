export interface ProjectAgentTaskFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  savedToProjectFileId?: string;
}

export interface ProjectAgentTaskSource {
  url: string;
  title: string;
  fetchedAt: string;
  sourceType: "page" | "search";
  query?: string;
  publishedAt?: string;
}
