import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { AirbnbUserProfile } from "@/components/AirbnbUserProfile";
import { getCurrentUser } from "@/lib/auth";
import { loadPublicProfile } from "@/lib/profile-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await loadPublicProfile(id);

  if (!data) {
    return {
      title: "Profile not found · 36",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: data.user.name + " · 36",
    description:
      data.user.role === "STUDIO_OWNER"
        ? "View " + data.user.name + "'s verified studios and hosting activity on 36."
        : "View " + data.user.name + "'s creator profile and verified activity on 36.",
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await getCurrentUser();
  const { id } = await params;
  const data = await loadPublicProfile(id);

  if (!data) notFound();

  const isOwner = data.user.role === "STUDIO_OWNER";

  const studios = data.studios.map((studio) => {
    const rating = studio.reviews.length
      ? studio.reviews.reduce((sum, review) => sum + review.rating, 0) /
        studio.reviews.length
      : null;

    return {
      id: studio.id,
      name: studio.name,
      slug: studio.slug,
      city: studio.city,
      neighborhood: studio.neighborhood,
      photoUrl: studio.photos[0]?.url || null,
      priceMad: studio.rooms[0]?.hourlyRateMad || null,
      rating,
      reviewCount: studio.reviews.length,
    };
  });

  const reviews = data.reviews.map((review: any) => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    studioName: review.studio.name,
    studioSlug: review.studio.slug,
    personName: isOwner ? review.creator?.name || null : null,
    personId: isOwner ? review.creator?.id || null : null,
    direction: isOwner ? ("RECEIVED" as const) : ("WRITTEN" as const),
  }));

  return (
    <main className="min-h-screen bg-[#e9eef5]">
      <AppHeader user={currentUser} />
      <section className="mx-auto max-w-[1536px] px-0 pb-8 sm:px-3 sm:py-4 lg:px-4">
        <AirbnbUserProfile
          profile={{
            id: data.user.id,
            name: data.user.name,
            role: data.user.role,
            emailVerified: Boolean(data.user.emailVerifiedAt),
            createdAt: data.user.createdAt,
            completedSessions: data.completedSessions,
            reviewCount: isOwner
              ? data.reviewsReceived
              : data.reviewsWritten,
            averageRating: data.averageRating,
          }}
          studios={studios}
          reviews={reviews}
        />
      </section>
    </main>
  );
}
