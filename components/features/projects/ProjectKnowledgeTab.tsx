"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, FileText, Loader2, RotateCw, Trash2, Upload } from "lucide-react";
import { useProjectStore, type KnowledgeFile } from "@/stores/useProjectStore";
import { ProjectKnowledgeFilePreview } from "./ProjectKnowledgeFilePreview";

const ACCEPTED_EXTENSIONS =
  ".txt,.md,.csv,.tsv,.json,.jsonl,.xml,.yaml,.yml,.log,.html,.htm,.pdf,.doc,.docx,.xls,.xlsx,.pptx,.png,.jpg,.jpeg,.gif,.webp";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileThumbnail({ kf, projectId }: { kf: KnowledgeFile; projectId: string }) {
  if (kf.fileType === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/projects/${encodeURIComponent(projectId)}/knowledge/image?fileId=${kf.id}`}
        alt={kf.name}
        className="w-7 h-7 rounded object-cover flex-shrink-0 border border-slate-200 dark:border-slate-700"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />;
}

function StatusBadge({ status }: { status: KnowledgeFile["status"] }) {
  if (status === "ready") {
    return <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">ready</span>;
  }
  if (status === "uploading" || status === "processing") {
    return <Loader2 className="w-3 h-3 animate-spin text-slate-400" />;
  }
  return <AlertCircle className="w-3 h-3 text-red-400" />;
}

export function ProjectKnowledgeTab({ projectId }: { projectId: string }) {
  const getProjectById = useProjectStore((s) => s.getProjectById);
  const addKnowledgeFilesBatch = useProjectStore((s) => s.addKnowledgeFilesBatch);
  const removeKnowledgeFile = useProjectStore((s) => s.removeKnowledgeFile);
  const refreshProject = useProjectStore((s) => s.refreshProject);
  const isSyncing = useProjectStore((s) => s.isSyncing);

  const project = getProjectById(projectId);
  const knowledgeFiles = project?.knowledgeFiles ?? [];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<
    { name: string; size: number; status: "pending" | "uploading" | "error"; error?: string }[]
  >([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<KnowledgeFile | null>(null);
  const [extendingId, setExtendingId] = useState<string | null>(null);

  function openPreview(kf: KnowledgeFile) {
    setPreviewFile(kf);
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;

    const queue = selected.map((file) => ({
      name: file.name,
      size: file.size,
      status: "pending" as const,
    }));
    setPendingFiles(queue);
    if (fileInputRef.current) fileInputRef.current.value = "";

    setPendingFiles(queue.map((item) => ({ ...item, status: "uploading" as const })));
    try {
      const { errors } = await addKnowledgeFilesBatch(projectId, selected);
      if (errors.length === 0) {
        setPendingFiles([]);
        return;
      }

      setPendingFiles(
        queue.map((item) => {
          const error = errors.find((entry) => entry.name === item.name);
          return error
            ? { ...item, status: "error" as const, error: error.error }
            : { ...item, status: "uploading" as const };
        }),
      );
    } catch (err) {
      setPendingFiles(
        queue.map((item) => ({
          ...item,
          status: "error" as const,
          error: err instanceof Error ? err.message : "Upload failed",
        })),
      );
    }
  }

  async function handleRemove(fileId: string) {
    setRemovingId(fileId);
    try {
      await removeKnowledgeFile(projectId, fileId);
    } finally {
      setRemovingId(null);
    }
  }

  async function handleExtendRetention(fileId: string) {
    setExtendingId(fileId);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge/retention`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not extend file retention");
      await refreshProject(projectId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not extend file retention");
    } finally {
      setExtendingId(null);
    }
  }

  return (
    <>
      {previewFile && <ProjectKnowledgeFilePreview projectId={projectId} file={previewFile} onClose={() => setPreviewFile(null)} />}

      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          Files up to 50 MB are indexed when added. Larger files upload in chunks and the Project Agent reads selected sections on demand; their originals are stored for 30 days and can be extended.
        </p>

        <div
          className="relative border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-5 text-center cursor-pointer hover:border-orange-400 dark:hover:border-orange-500 transition-colors"
          onClick={() => !isSyncing && fileInputRef.current?.click()}
        >
          {isSyncing ? (
            <Loader2 className="w-5 h-5 mx-auto mb-1.5 text-orange-400 animate-spin" />
          ) : (
            <Upload className="w-5 h-5 mx-auto mb-1.5 text-slate-400" />
          )}
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            {isSyncing ? "Uploading..." : (
              <>
                Drop files here or <span className="text-orange-500 font-medium">browse</span>
              </>
            )}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            TXT, MD, CSV, JSON, PDF, DOCX, XLSX, PPTX, PNG, JPG. Multiple files OK.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            className="sr-only"
            onChange={handleFileChange}
            disabled={isSyncing}
          />
        </div>

        {pendingFiles.length > 0 && (
          <div className="flex flex-col gap-1">
            {pendingFiles.map((file) => (
              <div
                key={file.name}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40"
              >
                {file.status === "error" ? (
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-slate-700 dark:text-slate-200 truncate font-medium">
                    {file.name}
                  </p>
                  {file.error && <p className="text-[11px] text-red-500">{file.error}</p>}
                </div>
                <span className="text-[10px] text-slate-400">{formatBytes(file.size)}</span>
              </div>
            ))}
          </div>
        )}

        {knowledgeFiles.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {knowledgeFiles.length} file{knowledgeFiles.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-col gap-1">
              {knowledgeFiles.map((kf) => (
                <div
                  key={kf.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors group"
                  onClick={() => kf.status === "ready" && openPreview(kf)}
                  title={kf.status === "ready" ? `Preview ${kf.name}` : undefined}
                >
                  <FileThumbnail kf={kf} projectId={projectId} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-slate-700 dark:text-slate-200 truncate font-medium">
                      {kf.name}
                    </p>
                    <p className="text-[11px] text-slate-400">{formatBytes(kf.sizeBytes)}</p>
                    {kf.isLargeSource && kf.retentionExpiresAt && (
                      <p className="text-[10px] text-slate-400">Stored until {new Date(kf.retentionExpiresAt).toLocaleDateString()}</p>
                    )}
                  </div>
                  <StatusBadge status={kf.status} />
                  {kf.isLargeSource && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleExtendRetention(kf.id); }}
                      disabled={extendingId === kf.id || isSyncing || (kf.retentionExpiresAt ?? 0) <= Date.now()}
                      className="p-1 rounded text-slate-400 hover:text-orange-500 transition-colors disabled:opacity-40"
                      aria-label={`Extend storage for ${kf.name} by 30 days`}
                      title="Keep this source for another 30 days"
                    >
                      {extendingId === kf.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleRemove(kf.id);
                    }}
                    disabled={removingId === kf.id || isSyncing}
                    className="p-1 rounded text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
                    aria-label={`Remove ${kf.name}`}
                  >
                    {removingId === kf.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {knowledgeFiles.length === 0 && pendingFiles.length === 0 && (
          <p className="text-center text-[12px] text-slate-400 dark:text-slate-500 py-2">
            No files yet.
          </p>
        )}
      </div>
    </>
  );
}
