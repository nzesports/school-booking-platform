"use client";

export function uploadResourceWithProgress(
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", signedUrl);
    request.setRequestHeader("Content-Type", contentType);
    request.setRequestHeader("cache-control", "max-age=3600");
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.onerror = () => reject(new Error("The connection was interrupted. Please check your connection and retry."));
    request.onabort = () => reject(new Error("The upload was cancelled."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      let message = "Storage could not accept the upload. Please retry.";
      try {
        const response = JSON.parse(request.responseText);
        if (typeof response.message === "string") message = response.message;
        else if (typeof response.error === "string") message = response.error;
      } catch {
        // Do not expose raw proxy error pages.
      }
      if (request.status === 413 || /maximum allowed size|too large|exceeded.*size/i.test(message)) {
        message = "Storage rejected the file size. Check that both the Supabase global storage limit and the resources bucket limit allow 500 MB. The bucket migration does not change the global limit.";
      }
      reject(new Error(message));
    };
    request.send(file);
  });
}
