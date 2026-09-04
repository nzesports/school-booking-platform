"use client";

import {
  CheckCircle2,
  FileText,
  ImageIcon,
  LoaderCircle,
  Upload,
  Video
} from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

const MAX_FILES = 15;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconForFile(file: File) {
  if (file.type.startsWith("image/")) return ImageIcon;
  if (file.type.startsWith("video/")) return Video;
  return FileText;
}

export function ReportMediaUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-3">
      <label className="group flex min-h-[76px] cursor-pointer items-center justify-center gap-3 rounded-[16px] border border-dashed border-[#b9c8dc] bg-[#f8fafc] px-4 py-4 text-sm text-[color:var(--navy)] transition hover:border-[#7da6df] hover:bg-[#f4f8fe]">
        <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#2563eb] shadow-sm">
          <Upload className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <span>
          <span className="block font-semibold">Choose photos, videos or PDFs</span>
          <span className="mt-0.5 block text-xs text-[color:var(--text-soft)]">Up to 15 files · 5 MB each</span>
        </span>
        <input
          type="file"
          name="mediaFiles"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.mp4,.mov,.webm,.pdf"
          className="sr-only"
          onChange={(event) => {
            const allFiles = Array.from(event.currentTarget.files ?? []);
            const selectedFiles = allFiles.slice(0, MAX_FILES);
            const validationError = allFiles.length > MAX_FILES
              ? "Choose no more than 15 files."
              : selectedFiles.some((file) => file.size > MAX_FILE_BYTES)
                ? "Each file must be 5 MB or smaller."
                : null;

            if (allFiles.length > MAX_FILES) {
              const transfer = new DataTransfer();
              selectedFiles.forEach((file) => transfer.items.add(file));
              event.currentTarget.files = transfer.files;
            }

            event.currentTarget.setCustomValidity(validationError ?? "");
            setError(validationError);
            setFiles(selectedFiles);
          }}
        />
      </label>

      {error ? <p className="text-xs font-semibold text-[#9d2424]">{error}</p> : null}

      <SelectedFileRows files={files} />
    </div>
  );
}

function SelectedFileRows({ files }: { files: File[] }) {
  const { pending } = useFormStatus();

  if (files.length === 0) return null;

  return (
    <div className="grid gap-2" aria-live="polite">
      {files.map((file) => {
        const Icon = iconForFile(file);

        return (
          <div key={`${file.name}-${file.size}-${file.lastModified}`} className="overflow-hidden rounded-[14px] border border-[color:var(--border-soft)] bg-white">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#e8f1fd] text-[#2563eb]">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[color:var(--navy)]">{file.name}</span>
                <span className="block text-xs text-[color:var(--text-soft)]">{formatFileSize(file.size)}</span>
              </span>
              <span className={pending ? "inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563eb]" : "inline-flex items-center gap-1.5 text-xs font-semibold text-[#117a2e]"}>
                {pending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {pending ? "Uploading" : "Selected"}
              </span>
            </div>
            <div className="h-1 bg-[#edf2f7]">
              <div className={pending ? "h-full w-[82%] animate-pulse rounded-r-full bg-[#2563eb] transition-all duration-700" : "h-full w-0 bg-[#2563eb]"} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
