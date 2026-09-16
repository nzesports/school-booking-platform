export const RESOURCE_UPLOAD_MAX_MB = 250;
export const RESOURCE_UPLOAD_MAX_BYTES = RESOURCE_UPLOAD_MAX_MB * 1024 * 1024;
export const RESOURCE_VIDEO_UPLOAD_MAX_MB = 500;

export function resourceUploadLimitMb(name: string) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  return extension && ["mp4", "mov", "webm"].includes(extension)
    ? RESOURCE_VIDEO_UPLOAD_MAX_MB
    : RESOURCE_UPLOAD_MAX_MB;
}
