import { del } from "@vercel/blob";

const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

export function studioPhotoPrefix(claimId: string) {
  return "studio-photos/" + claimId + "/";
}

export function isManagedStudioPhotoUrl(
  value: string,
  claimId?: string,
) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (!url.hostname.endsWith(BLOB_HOST_SUFFIX)) return false;
    if (!claimId) return url.pathname.includes("/studio-photos/");
    return url.pathname.includes("/" + studioPhotoPrefix(claimId));
  } catch {
    return false;
  }
}

export async function deleteManagedStudioPhotos(
  urls: string[],
  claimId: string,
) {
  const managed = [...new Set(urls)].filter((url) =>
    isManagedStudioPhotoUrl(url, claimId),
  );

  if (managed.length === 0) return { deleted: 0 };

  await del(managed);
  return { deleted: managed.length };
}
