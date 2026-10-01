export type GeocodeResult = {
  label: string;
  latitude: number;
  longitude: number;
  city?: string;
  neighborhood?: string;
  country?: string;
  countryCode?: string;
};

export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token || query.trim().length < 3) return [];
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "6");
  url.searchParams.set("language", "en,fr");
  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.features || []).map((f: any) => {
    const contexts = Array.isArray(f.context) ? f.context : [];
    const city = contexts.find((x: any) => String(x.id).startsWith("place."))?.text || (String(f.id).startsWith("place.") ? f.text : "");
    const neighborhood = contexts.find((x: any) => String(x.id).startsWith("neighborhood."))?.text || (String(f.id).startsWith("neighborhood.") ? f.text : "");
    const countryContext =
      contexts.find((x: any) => String(x.id).startsWith("country.")) ||
      (String(f.id).startsWith("country.") ? f : null);
    const country = String(countryContext?.text || "").trim();
    const countryCode = String(countryContext?.properties?.short_code || countryContext?.short_code || "")
      .trim()
      .slice(-2)
      .toUpperCase();
    return {
      label: f.place_name,
      longitude: Number(f.center?.[0]),
      latitude: Number(f.center?.[1]),
      city,
      neighborhood,
      country: country || undefined,
      countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : undefined,
    };
  }).filter((x: GeocodeResult) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
}
