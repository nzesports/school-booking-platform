"use client";

import {
  CheckCircle2,
  FileText,
  ImageIcon,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
  Upload,
  Video,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  prepareAmbassadorReportMediaUploadAction,
  prepareStaffReportMediaUploadAction
} from "@/app/portal/actions";
import { uploadResourceWithProgress } from "@/lib/resource-upload-client";

// Mirrors REPORT_MEDIA_MAX_FILES / REPORT_MEDIA_MAX_BYTES in lib/services/storage.ts.
const MAX_FILES = 15;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

type UploadItem = {
  key: string;
  file: File;
  status: "uploading" | "done" | "failed";
  percent: number;
  path?: string;
  error?: string;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconForFile(file: File) {
  if (file.type.startsWith("image/")) return ImageIcon;
  if (file.type.startsWith("video/")) return Video;
  return FileText;
}

// Files upload straight to storage as soon as they're chosen; the form only
// submits their storage paths (the `mediaUploads` field). Sending the bytes
// through the form broke submissions once photos passed the hosting body limit.
export function ReportMediaUpload({ uploader }: { uploader: "ambassador" | "staff" }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = items.some((item) => item.status === "uploading");
  const failed = items.some((item) => item.status === "failed");
  const uploaded = items.filter((item) => item.status === "done" && item.path);

  // Block the surrounding form from submitting until every file is stored.
  useEffect(() => {
    inputRef.current?.setCustomValidity(
      uploading
        ? "Wait for your files to finish uploading."
        : failed
          ? "Retry or remove the files that didn't upload."
          : ""
    );
  }, [uploading, failed]);

  const updateItem = (key: string, patch: Partial<UploadItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const upload = async (batch: UploadItem[]) => {
    const prepare =
      uploader === "staff"
        ? prepareStaffReportMediaUploadAction
        : prepareAmbassadorReportMediaUploadAction;
    let prepared: Awaited<ReturnType<typeof prepare>>;

    try {
      prepared = await prepare(batch.map((item) => ({ name: item.file.name, size: item.file.size })));
    } catch {
      prepared = { error: "Could not start the upload. Check your connection and try again." };
    }

    if (!("uploads" in prepared) || !prepared.uploads) {
      const message = "error" in prepared ? prepared.error : "Could not start the upload.";
      batch.forEach((item) => updateItem(item.key, { status: "failed", error: message }));
      return;
    }

    const uploads = prepared.uploads;

    await Promise.all(
      batch.map(async (item, index) => {
        const { path, signedUrl, contentType } = uploads[index];

        try {
          await uploadResourceWithProgress(signedUrl, item.file, contentType, (percent) =>
            updateItem(item.key, { percent })
          );
          updateItem(item.key, { status: "done", percent: 100, path });
        } catch (uploadError) {
          updateItem(item.key, {
            status: "failed",
            error: uploadError instanceof Error ? uploadError.message : "Upload failed."
          });
        }
      })
    );
  };

  return (
    <div className="grid gap-3">
      <label className="group flex min-h-[36px] cursor-pointer items-center justify-center gap-3 rounded-[8px] border border-dashed border-[#b9c8dc] bg-[#f8fafc] px-3 py-[9px] text-[12px] text-[color:var(--navy)] transition hover:border-[#7da6df] hover:bg-[#f4f8fe]">
        <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#2563eb] shadow-sm">
          <Upload className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <span>
          <span className="block font-semibold">Choose photos, videos or PDFs</span>
          <span className="mt-0.5 block text-xs text-[color:var(--text-soft)]">Up to 15 files · 50 MB each</span>
        </span>
        {/* No name: the bytes never travel with the form, only mediaUploads does. */}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.mp4,.mov,.webm,.pdf"
          className="sr-only"
          onChange={(event) => {
            const selected = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";

            if (selected.length === 0) {
              return;
            }

            if (items.length + selected.length > MAX_FILES) {
              setError("Choose no more than 15 files.");
              return;
            }

            if (selected.some((file) => file.size > MAX_FILE_BYTES)) {
              setError("Each file must be 50 MB or smaller.");
              return;
            }

            setError(null);
            const batch = selected.map((file) => ({
              key: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
              file,
              status: "uploading" as const,
              percent: 0
            }));
            setItems((current) => [...current, ...batch]);
            void upload(batch);
          }}
        />
      </label>

      <input
        type="hidden"
        name="mediaUploads"
        value={JSON.stringify(uploaded.map((item) => ({ path: item.path, name: item.file.name })))}
      />

      {error ? <p className="text-xs font-semibold text-[#9d2424]">{error}</p> : null}

      {items.length > 0 ? (
        <div className="grid gap-2" aria-live="polite">
          {items.map((item) => {
            const Icon = iconForFile(item.file);

            return (
              <div key={item.key} className="overflow-hidden rounded-[14px] border border-[color:var(--border-soft)] bg-white">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#e8f1fd] text-[#2563eb]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[color:var(--navy)]">{item.file.name}</span>
                    <span className="block text-xs text-[color:var(--text-soft)]">
                      {item.status === "failed" ? item.error : formatFileSize(item.file.size)}
                    </span>
                  </span>
                  {item.status === "uploading" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563eb]">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      {item.percent}%
                    </span>
                  ) : item.status === "done" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#117a2e]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Uploaded
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        updateItem(item.key, { status: "uploading", percent: 0, error: undefined });
                        void upload([item]);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9d2424] hover:underline"
                    >
                      <TriangleAlert className="h-3.5 w-3.5" />
                      Retry
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  )}
                  {item.status !== "uploading" ? (
                    <button
                      type="button"
                      onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                      aria-label={`Remove ${item.file.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--text-soft)] hover:bg-[#f1f5f9]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <div className="h-1 bg-[#edf2f7]">
                  <div
                    className={
                      item.status === "failed"
                        ? "h-full w-full bg-[#f2c6c6]"
                        : "h-full bg-[#2563eb] transition-all duration-300"
                    }
                    style={item.status === "failed" ? undefined : { width: `${item.percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
