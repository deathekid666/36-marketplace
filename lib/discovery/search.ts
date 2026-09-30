import {
  DiscoveryStudioCategory,
  StudioCategory,
} from "@prisma/client";

export function discoveryCategoriesForStudioCategory(
  category?: StudioCategory,
): DiscoveryStudioCategory[] | undefined {
  if (!category) return undefined;

  switch (category) {
    case StudioCategory.RECORDING:
      return [
        DiscoveryStudioCategory.RECORDING,
        DiscoveryStudioCategory.VOICE_OVER,
      ];
    case StudioCategory.PODCAST:
      return [DiscoveryStudioCategory.PODCAST];
    case StudioCategory.PHOTO:
      return [DiscoveryStudioCategory.PHOTO];
    case StudioCategory.VIDEO:
      return [
        DiscoveryStudioCategory.VIDEO,
        DiscoveryStudioCategory.LIVE_STREAMING,
      ];
    case StudioCategory.REHEARSAL:
      return [DiscoveryStudioCategory.REHEARSAL];
    case StudioCategory.DJ:
      return [DiscoveryStudioCategory.DJ];
    case StudioCategory.PRODUCTION:
      return [
        DiscoveryStudioCategory.PRODUCTION,
        DiscoveryStudioCategory.POST_PRODUCTION,
      ];
  }
}

export function discoveryCategoryLabel(category: DiscoveryStudioCategory) {
  return category
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
