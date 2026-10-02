import type { StudioCategory } from "@prisma/client";

import { getRoomAvailability } from "@/lib/booking";
import { db } from "@/lib/db";

type CurrentStudioShape = {
  id: string;
  city: string;
  currency: string;
  primaryCategory: StudioCategory;
  latitude: number | null;
  longitude: number | null;
  rooms: Array<{
    hourlyRateMad: number;
    equipment: Array<{ name: string }>;
  }>;
  amenities: Array<{ name: string }>;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earth = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(a));
}

export type RecommendedStudio = {
  id: string;
  name: string;
  slug: string;
  city: string;
  neighborhood: string;
  primaryCategory: StudioCategory;
  priceMad: number | null;
  currency: string;
  rating: number | null;
  reviewCount: number;
  photoUrl: string | null;
  distanceKm: number | null;
  score: number;
  reasons: string[];
  availableRooms: number | null;
};

export async function getStudioRecommendations(
  current: CurrentStudioShape,
  options?: {
    date?: string;
    durationHours?: number;
  },
) {
  const currentPrice = current.rooms.length
    ? Math.min(...current.rooms.map((room) => room.hourlyRateMad))
    : null;
  const currentEquipment = new Set(
    current.rooms.flatMap((room) =>
      room.equipment.map((item) => normalize(item.name)),
    ),
  );
  const currentAmenities = new Set(
    current.amenities.map((item) => normalize(item.name)),
  );

  const candidates = await db.studio.findMany({
    where: {
      id: { not: current.id },
      status: "VERIFIED",
      rooms: { some: { active: true } },
    },
    include: {
      photos: {
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
      rooms: {
        where: { active: true },
        orderBy: { hourlyRateMad: "asc" },
        include: {
          equipment: {
            orderBy: { name: "asc" },
          },
        },
      },
      amenities: {
        orderBy: { name: "asc" },
      },
      reviews: {
        select: { rating: true },
      },
    },
    take: 40,
  });

  const durationMinutes = Math.max(
    60,
    Math.min(12 * 60, (options?.durationHours || 1) * 60),
  );

  const rows: RecommendedStudio[] = [];

  for (const candidate of candidates) {
    const priceMad = candidate.rooms[0]?.hourlyRateMad ?? null;
    const rating = candidate.reviews.length
      ? candidate.reviews.reduce(
          (sum, review) => sum + review.rating,
          0,
        ) / candidate.reviews.length
      : null;

    let score = 0;
    const reasons: string[] = [];

    if (
      normalize(candidate.city) === normalize(current.city)
    ) {
      score += 30;
      reasons.push("Same city");
    }

    if (
      candidate.primaryCategory === current.primaryCategory
    ) {
      score += 40;
      reasons.push("Same studio type");
    }

    if (
      currentPrice != null &&
      priceMad != null &&
      candidate.currency === current.currency
    ) {
      const delta = Math.abs(priceMad - currentPrice);
      const priceScore = Math.max(
        0,
        20 - Math.round((delta / Math.max(currentPrice, 1)) * 20),
      );
      score += priceScore;
      if (priceMad < currentPrice) {
        reasons.push("Cheaper option");
      } else if (delta <= Math.max(50, currentPrice * 0.2)) {
        reasons.push("Similar price");
      }
    }

    const candidateEquipment = new Set(
      candidate.rooms.flatMap((room) =>
        room.equipment.map((item) => normalize(item.name)),
      ),
    );
    const equipmentOverlap = [...currentEquipment].filter((item) =>
      candidateEquipment.has(item),
    ).length;
    if (equipmentOverlap) {
      score += Math.min(20, equipmentOverlap * 5);
      reasons.push(
        equipmentOverlap +
          " matching equipment item" +
          (equipmentOverlap === 1 ? "" : "s"),
      );
    }

    const candidateAmenities = new Set(
      candidate.amenities.map((item) => normalize(item.name)),
    );
    const amenityOverlap = [...currentAmenities].filter((item) =>
      candidateAmenities.has(item),
    ).length;
    if (amenityOverlap) {
      score += Math.min(12, amenityOverlap * 3);
    }

    let distanceKm: number | null = null;
    if (
      current.latitude != null &&
      current.longitude != null &&
      candidate.latitude != null &&
      candidate.longitude != null
    ) {
      distanceKm = haversineKm(
        Number(current.latitude),
        Number(current.longitude),
        Number(candidate.latitude),
        Number(candidate.longitude),
      );
      if (distanceKm <= 5) {
        score += 18;
        reasons.push("Very nearby");
      } else if (distanceKm <= 15) {
        score += 10;
        reasons.push("Nearby");
      }
    }

    let availableRooms: number | null = null;
    if (options?.date) {
      const roomChecks = await Promise.all(
        candidate.rooms.map((room) =>
          getRoomAvailability(
            room.id,
            options.date!,
            durationMinutes,
          ),
        ),
      );
      availableRooms = roomChecks.filter(
        (slots) => slots.length > 0,
      ).length;
      if (availableRooms > 0) {
        score += 35;
        reasons.unshift("Available on your date");
      }
    }

    rows.push({
      id: candidate.id,
      name: candidate.name,
      slug: candidate.slug,
      city: candidate.city,
      neighborhood: candidate.neighborhood,
      primaryCategory: candidate.primaryCategory,
      priceMad,
      currency: candidate.currency,
      rating,
      reviewCount: candidate.reviews.length,
      photoUrl: candidate.photos[0]?.url || null,
      distanceKm,
      score,
      reasons: reasons.slice(0, 3),
      availableRooms,
    });
  }

  const ranked = [...rows].sort(
    (a, b) =>
      b.score - a.score ||
      (b.rating || 0) - (a.rating || 0) ||
      (a.priceMad || Number.MAX_SAFE_INTEGER) -
        (b.priceMad || Number.MAX_SAFE_INTEGER),
  );

  return {
    similar: ranked.slice(0, 4),
    cheaper:
      currentPrice == null
        ? []
        : rows
            .filter(
              (row) =>
                row.currency === current.currency &&
                row.priceMad != null &&
                row.priceMad < currentPrice,
            )
            .sort(
              (a, b) =>
                (a.priceMad || 0) - (b.priceMad || 0),
            )
            .slice(0, 4),
    nearby: rows
      .filter((row) => row.distanceKm != null)
      .sort(
        (a, b) =>
          (a.distanceKm || Number.MAX_SAFE_INTEGER) -
          (b.distanceKm || Number.MAX_SAFE_INTEGER),
      )
      .slice(0, 4),
    available: options?.date
      ? rows
          .filter((row) => (row.availableRooms || 0) > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 4)
      : [],
  };
}
