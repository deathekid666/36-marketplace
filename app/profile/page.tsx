import { AppHeader } from "@/components/AppHeader";
import { AirbnbUserProfile } from "@/components/AirbnbUserProfile";
import { requireUser } from "@/lib/auth";
import { loadPublicProfile } from "@/lib/profile-data";

function transform(data: NonNullable<Awaited<ReturnType<typeof loadPublicProfile>>>) {
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

  return { studios, reviews };
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const data = await loadPublicProfile(user.id);

  if (!data) return null;

  const view = transform(data);

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />
      <section className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <AirbnbUserProfile
          profile={{
            id: data.user.id,
            name: data.user.name,
            role: data.user.role,
            emailVerified: Boolean(data.user.emailVerifiedAt),
            createdAt: data.user.createdAt,
            completedSessions: data.completedSessions,
            reviewCount:
              data.user.role === "STUDIO_OWNER"
                ? data.reviewsReceived
                : data.reviewsWritten,
            averageRating: data.averageRating,
          }}
          studios={view.studios}
          reviews={view.reviews}
          isSelf
          email={user.email}
          phone={user.phone}
          saved={query.saved === "1"}
          error={query.error}
        />
      </section>
    </main>
  );
}
