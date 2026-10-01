import { del } from "@vercel/blob";

const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

export function studioPhotoPrefix(claimId: string) {
  return "studio-photos/" + claimId + "/";
}

export function marketplaceStudioPhotoPrefix(studioId: string) {
  return "marketplace-studios/" + studioId + "/";
}

function isBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(BLOB_HOST_SUFFIX)
    );
  } catch {
    return false;
  }
}

export function isManagedStudioPhotoUrl(
  value: string,
  claimId?: string,
) {
  if (!isBlobUrl(value)) return false;
  const url = new URL(value);
  if (!claimId) return url.pathname.includes("/studio-photos/");
  return url.pathname.includes("/" + studioPhotoPrefix(claimId));
}

export function isManagedMarketplaceStudioPhotoUrl(
  value: string,
  studioId?: string,
) {
  if (!isBlobUrl(value)) return false;
  const url = new URL(value);
  if (!studioId) return url.pathname.includes("/marketplace-studios/");
  return url.pathname.includes("/" + marketplaceStudioPhotoPrefix(studioId));
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

export async function deleteManagedMarketplaceStudioPhotos(
  urls: string[],
  studioId: string,
) {
  const managed = [...new Set(urls)].filter((url) =>
    isManagedMarketplaceStudioPhotoUrl(url, studioId),
  );

  if (managed.length === 0) return { deleted: 0 };

  await del(managed);
  return { deleted: managed.length };
}
