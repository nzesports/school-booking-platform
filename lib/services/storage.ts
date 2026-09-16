import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/utils";
import { resourceUploadLimitMb } from "@/lib/resource-upload";

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const PRIVATE_ALLOWED = new Map([
  ["pdf", "application/pdf"],
  ["ppt", "application/vnd.ms-powerpoint"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["txt", "text/plain"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["mp4", "video/mp4"],
  ["mov", "video/quicktime"],
  ["webm", "video/webm"],
  ["zip", "application/zip"]
]);

const PUBLIC_ALLOWED = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"]
]);

// Report media: presentation photos/videos plus signed media release forms.
// These can contain identifiable students, so they live in the private
// `report-media` bucket and are only served through the auth-gated
// /portal/report-media/[mediaId] route.
const REPORT_MEDIA_ALLOWED = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["mp4", "video/mp4"],
  ["mov", "video/quicktime"],
  ["webm", "video/webm"],
  ["pdf", "application/pdf"]
]);

function fileExtension(name: string) {
  const segments = name.split(".");
  return segments.length > 1 ? segments.at(-1)?.toLowerCase() ?? "bin" : "bin";
}

function buildStoragePath(prefix: string, fileName: string) {
  const stem = fileName.replace(/\.[^.]+$/, "");
  return `${prefix}/${slugify(stem)}-${randomUUID().slice(0, 8)}.${fileExtension(fileName)}`;
}

function validateUpload(file: File, allowed: Map<string, string>) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Upload exceeds the 40MB limit.");
  }

  const extension = fileExtension(file.name);
  const contentType = allowed.get(extension);

  if (!contentType) {
    throw new Error("File type is not allowed.");
  }

  return contentType;
}

export function validatePublicAvatarFile(file: File) {
  if (!file.name || file.size === 0) {
    throw new Error("Choose a profile photo to continue.");
  }

  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Profile photos must be 5MB or smaller.");
  }

  const extension = fileExtension(file.name);
  const allowedTypes = new Map([
    ["png", "image/png"],
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["webp", "image/webp"]
  ]);
  const expectedType = allowedTypes.get(extension);

  if (!expectedType || file.type !== expectedType) {
    throw new Error("Profile photos must be JPG, PNG, or WebP files.");
  }

  return expectedType;
}

export function validateResourceUpload(name: string, size: number) {
  const contentType = PRIVATE_ALLOWED.get(fileExtension(name));
  if (!contentType) throw new Error("This file type is not supported.");
  const limitMb = resourceUploadLimitMb(name);
  if (!Number.isSafeInteger(size) || size <= 0 || size > limitMb * 1024 * 1024) {
    throw new Error(`Choose a file up to ${limitMb} MB.`);
  }
  return contentType;
}

export async function prepareResourceUpload(userId: string, name: string, size: number) {
  const contentType = validateResourceUpload(name, size);
  const admin = createAdminClient();
  if (!admin) throw new Error("Storage is not configured.");
  const path = buildStoragePath(`resource-library/${userId}`, name);
  const { data, error } = await admin.storage.from("resources").createSignedUploadUrl(path);
  if (error) throw error;
  return { path: data.path, signedUrl: data.signedUrl, contentType };
}

export async function validateUploadedResource(userId: string, path: string) {
  if (!path.startsWith(`resource-library/${userId}/`) || path.includes("..")) {
    throw new Error("Invalid uploaded resource path.");
  }
  const admin = createAdminClient();
  if (!admin) throw new Error("Storage is not configured.");
  const { data, error } = await admin.storage.from("resources").info(path);
  if (error) throw error;
  validateResourceUpload(path, data.size ?? 0);
  return path;
}

export async function uploadPrivateResourceFile(file: File, prefix = "resource-library") {
  const admin = createAdminClient();

  if (!admin) {
    throw new Error("Supabase admin storage access is not configured.");
  }

  const contentType = validateUpload(file, PRIVATE_ALLOWED);
  const storagePath = buildStoragePath(prefix, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from("resources").upload(storagePath, buffer, {
    contentType,
    upsert: false
  });

  if (error) {
    throw error;
  }

  return {
    storagePath,
    publicUrl: null
  };
}

export async function uploadPrivateReportMedia(file: File, prefix = "report-media") {
  const admin = createAdminClient();

  if (!admin) {
    throw new Error("Supabase admin storage access is not configured.");
  }

  const contentType = validateUpload(file, REPORT_MEDIA_ALLOWED);
  const storagePath = buildStoragePath(prefix, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from("report-media").upload(storagePath, buffer, {
    contentType,
    upsert: false
  });

  if (error) {
    throw error;
  }

  return {
    storagePath,
    publicUrl: null
  };
}

export async function createSignedReportMediaUrl(
  storagePath?: string | null,
  expiresInSeconds = 60 * 60
) {
  if (!storagePath) {
    return null;
  }

  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data, error } = await admin.storage
    .from("report-media")
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

export async function uploadPublicAsset(file: File, prefix = "content") {
  const admin = createAdminClient();

  if (!admin) {
    throw new Error("Supabase admin storage access is not configured.");
  }

  const contentType = validateUpload(file, PUBLIC_ALLOWED);
  const storagePath = buildStoragePath(prefix, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from("public-assets").upload(storagePath, buffer, {
    contentType,
    upsert: false
  });

  if (error) {
    throw error;
  }

  const { data } = admin.storage.from("public-assets").getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: data.publicUrl
  };
}

export async function uploadPublicAvatar(file: File, userId: string) {
  const admin = createAdminClient();

  if (!admin) {
    throw new Error("Supabase admin storage access is not configured.");
  }

  const contentType = validatePublicAvatarFile(file);
  const storagePath = buildStoragePath(`ambassador-avatars/${userId}`, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from("public-assets").upload(storagePath, buffer, {
    contentType,
    upsert: false
  });

  if (error) {
    throw error;
  }

  const { data } = admin.storage.from("public-assets").getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: data.publicUrl
  };
}

export async function deletePublicAsset(storagePath: string) {
  const admin = createAdminClient();

  if (!admin) {
    return;
  }

  await admin.storage.from("public-assets").remove([storagePath]);
}

export async function deletePrivateResourceFile(storagePath: string) {
  const admin = createAdminClient();

  if (!admin) {
    return;
  }

  await admin.storage.from("resources").remove([storagePath]);
}

export async function createSignedResourceUrl(
  storagePath?: string | null,
  expiresInSeconds = 60 * 60,
  download?: boolean | string
) {
  if (!storagePath) {
    return null;
  }

  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data, error } = await admin.storage
    .from("resources")
    .createSignedUrl(storagePath, expiresInSeconds, download ? { download } : undefined);

  if (error) {
    return null;
  }

  return data.signedUrl;
}
