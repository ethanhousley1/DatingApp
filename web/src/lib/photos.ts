"use client";

import { supabase } from "./supabase";

export const MAX_PHOTOS = 6;

// Shrinks phone photos before upload (max 1600px on the long side, JPEG).
// Falls back to the original file if the browser can't decode it.
export async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function uploadPhoto(userId: string, file: File, position: number) {
  const sb = supabase();
  const blob = await shrinkImage(file);
  const type = blob.type || file.type || "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/heic" ? "heic" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await sb.storage.from("photos").upload(path, blob, { contentType: type });
  if (upErr) throw upErr;
  const { error } = await sb.from("photos").insert({ user_id: userId, path, position });
  if (error) {
    await sb.storage.from("photos").remove([path]);
    throw error;
  }
  return path;
}

export async function deletePhoto(id: string, path: string) {
  const sb = supabase();
  const { error } = await sb.from("photos").delete().eq("id", id);
  if (error) throw error;
  await sb.storage.from("photos").remove([path]);
}
