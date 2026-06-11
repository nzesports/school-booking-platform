import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/utils";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const PRIVATE_ALLOWED = new Map([
  ["pdf", "application/pdf"],
  ["ppt", "application/vnd.ms-powerpoint"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["txt", "text/plain"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"]
]);

const PUBLIC_ALLOWED = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"]
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
    throw new Error("Upload exceeds the 25MB limit.");
  }

  const extension = fileExtension(file.name);
  const contentType = allowed.get(extension);

  if (!contentType) {
    throw new Error("File type is not allowed.");
  }

  return contentType;
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

export async function createSignedResourceUrl(storagePath?: string | null, expiresInSeconds = 60 * 60) {
  if (!storagePath) {
    return null;
  }

  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data, error } = await admin.storage.from("resources").createSignedUrl(storagePath, expiresInSeconds);

  if (error) {
    return null;
  }

  return data.signedUrl;
}
