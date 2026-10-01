import { del } from "@vercel/blob";

const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

export type ProfileImageKind = "avatar" | "cover";

export function profileImagePrefix(userId: string, kind: ProfileImageKind) {
  return "profiles/" + userId + "/" + kind + "/";
}

export function profileImageStoredKind(kind: ProfileImageKind) {
  return kind === "avatar" ? "PROFILE_AVATAR" : "PROFILE_COVER";
}

export function isManagedProfileImageUrl(
  value: string,
  userId: string,
  kind: ProfileImageKind,
) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(BLOB_HOST_SUFFIX) &&
      url.pathname.includes("/" + profileImagePrefix(userId, kind))
    );
  } catch {
    return false;
  }
}

export async function deleteManagedProfileImages(
  urls: string[],
  userId: string,
  kind: ProfileImageKind,
) {
  const managed = [...new Set(urls)].filter((url) =>
    isManagedProfileImageUrl(url, userId, kind),
  );

  if (managed.length === 0) return { deleted: 0 };
  await del(managed);
  return { deleted: managed.length };
}
