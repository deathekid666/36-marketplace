import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categoryLabel } from "@/lib/studio";

const categories = [
  { value: "RECORDING", label: "Recording", glyph: "◉" },
  { value: "PODCAST", label: "Podcast", glyph: "◌" },
  { value: "PHOTO", label: "Photo", glyph: "▣" },
  { value: "VIDEO", label: "Video", glyph: "▷" },
  { value: "REHEARSAL", label: "Rehearsal", glyph: "♫" },
  { value: "DJ", label: "DJ", glyph: "⌁" },
  { value: "PRODUCTION", label: "Production", glyph: "◇" },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  const featured = await db.studio.findMany({
    where: { status: "VERIFIED" },
    include: {
      photos: { orderBy: { sortOrder: "asc" }, take: 1 },
      rooms: { where: { active: true }, orderBy: { hourlyRateMad: "asc" }, take: 1 },
      reviews: { select: { rating: true } },
    },
    orderBy: [{ verifiedAt: "desc" }, { name: "asc" }],
    take: 8,
  }).catch(() => []);

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />

      <section className="air-home-hero">
        <div className="air-home-tabs">
          <Link href="/studios" className="active">Studios</Link>
          <Link href="/now">36 NOW</Link>
          <Link href="/discover">Discover</Link>
        </div>

        <h1>Find the right space to create.</h1>
        <p>Recording, podcast, photo, video and production studios — bookable in one place.</p>

        <form action="/studios" method="GET" className="air-home-search">
          <label>
            <b>Where</b>
            <input name="city" defaultValue="Casablanca" placeholder="Search city or neighborhood" />
          </label>
          <label>
            <b>When</b>
            <input name="date" type="date" />
          </label>
          <label>
            <b>Duration</b>
            <select name="duration" defaultValue="1">
              {[1,2,3,4,5,6,8].map((hours) => <option key={hours} value={hours}>{hours} hour{hours === 1 ? "" : "s"}</option>)}
            </select>
          </label>
          <label>
            <b>Studio type</b>
            <select name="category" defaultValue="">
              <option value="">Any studio</option>
              {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <button aria-label="Search studios">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <span>Search</span>
          </button>
        </form>
      </section>

      <section className="air-category-strip">
        <div className="air-category-strip-inner">
          {categories.map((item) => (
            <Link key={item.value} href={"/studios?category=" + item.value + "&city=Casablanca"}>
              <span>{item.glyph}</span>
              <b>{item.label}</b>
            </Link>
          ))}
        </div>
      </section>

      <section className="air-home-content">
        <div className="air-section-heading">
          <div>
            <h2>Studios to get you started</h2>
            <p>Verified creative spaces available on 36.</p>
          </div>
          <Link href="/studios">Show all</Link>
        </div>

        {featured.length > 0 ? (
          <div className="air-listing-grid">
            {featured.map((studio) => {
              const photo = studio.photos[0]?.url;
              const price = studio.rooms[0]?.hourlyRateMad;
              const rating = studio.reviews.length
                ? studio.reviews.reduce((sum, review) => sum + review.rating, 0) / studio.reviews.length
                : null;

              return (
                <Link key={studio.id} href={"/studios/" + studio.slug} className="air-listing-card">
                  <div className="air-listing-photo">
                    {photo ? <img src={photo} alt={studio.name} /> : <div className="air-listing-fallback">36</div>}
                    <span className="air-listing-heart">♡</span>
                    <span className="air-listing-badge">Verified</span>
                  </div>
                  <div className="air-listing-title-row">
                    <b>{studio.name}</b>
                    <span>{rating ? "★ " + rating.toFixed(1) : "New"}</span>
                  </div>
                  <p>{studio.neighborhood || studio.city}, {studio.city}</p>
                  <p>{categoryLabel(studio.primaryCategory)}</p>
                  <strong>{price ? price + " MAD" : "—"} <span>/ hour</span></strong>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="air-empty-home">
            <b>Verified studios are being added.</b>
            <p>Browse the full marketplace or discover contact-only studios while inventory grows.</p>
            <Link href="/studios">Explore studios</Link>
          </div>
        )}
      </section>

      <section className="air-home-banner">
        <div>
          <span>For creators</span>
          <h2>Need something specific?</h2>
          <p>Post your time, budget and requirements and let compatible studios respond.</p>
          <Link href={user?.role === "CREATOR" ? "/creator/requests" : "/auth/signup"}>Create a 36 Request</Link>
        </div>
        <div>
          <span>Last minute</span>
          <h2>Book empty studio time.</h2>
          <p>36 NOW surfaces short-notice availability from studio owners.</p>
          <Link href="/now">Browse 36 NOW</Link>
        </div>
      </section>
    </main>
  );
}
