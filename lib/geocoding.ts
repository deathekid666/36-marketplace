export type GeocodeResult = {
  label: string;
  latitude: number;
  longitude: number;
  city?: string;
  neighborhood?: string;
  country?: string;
  countryCode?: string;
};

function uniqueParts(parts: Array<unknown>) {
  const values = parts
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return values.filter(
    (value, index) =>
      values.findIndex(
        (candidate) =>
          candidate.toLocaleLowerCase() === value.toLocaleLowerCase(),
      ) === index,
  );
}

async function geocodeWithMapbox(
  query: string,
  token: string,
): Promise<GeocodeResult[]> {
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query,
    )}.json`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "6");
  url.searchParams.set("language", "en,fr");

  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });
  if (!response.ok) return [];

  const data = await response.json();
  return (data.features || [])
    .map((feature: any) => {
      const contexts = Array.isArray(feature.context)
        ? feature.context
        : [];
      const city =
        contexts.find((item: any) =>
          String(item.id).startsWith("place."),
        )?.text ||
        (String(feature.id).startsWith("place.")
          ? feature.text
          : "");
      const neighborhood =
        contexts.find((item: any) =>
          String(item.id).startsWith("neighborhood."),
        )?.text ||
        (String(feature.id).startsWith("neighborhood.")
          ? feature.text
          : "");
      const countryContext =
        contexts.find((item: any) =>
          String(item.id).startsWith("country."),
        ) ||
        (String(feature.id).startsWith("country.")
          ? feature
          : null);
      const country = String(countryContext?.text || "").trim();
      const countryCode = String(
        countryContext?.properties?.short_code ||
          countryContext?.short_code ||
          "",
      )
        .trim()
        .slice(-2)
        .toUpperCase();

      return {
        label: String(feature.place_name || feature.text || "").trim(),
        longitude: Number(feature.center?.[0]),
        latitude: Number(feature.center?.[1]),
        city: city || undefined,
        neighborhood: neighborhood || undefined,
        country: country || undefined,
        countryCode: /^[A-Z]{2}$/.test(countryCode)
          ? countryCode
          : undefined,
      };
    })
    .filter(
      (result: GeocodeResult) =>
        result.label &&
        Number.isFinite(result.latitude) &&
        Number.isFinite(result.longitude),
    );
}

async function geocodeWithPhoton(
  query: string,
): Promise<GeocodeResult[]> {
  const base =
    process.env.GEOCODING_FALLBACK_URL ||
    "https://photon.komoot.io/api";
  const url = new URL(base);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lang", "en");

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "36-marketplace/1.0 (+https://36-marketplace.vercel.app)",
      Accept: "application/json",
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) return [];

  const data = await response.json();
  return (data.features || [])
    .map((feature: any) => {
      const properties = feature.properties || {};
      const coordinates = feature.geometry?.coordinates || [];
      const longitude = Number(coordinates[0]);
      const latitude = Number(coordinates[1]);

      const streetLine = uniqueParts([
        properties.housenumber,
        properties.street,
      ]).join(" ");
      const firstLine =
        String(properties.name || "").trim() ||
        streetLine ||
        String(properties.street || "").trim();

      const label = uniqueParts([
        firstLine,
        streetLine &&
        streetLine.toLocaleLowerCase() !== firstLine.toLocaleLowerCase()
          ? streetLine
          : "",
        properties.district,
        properties.city,
        properties.county,
        properties.state,
        properties.country,
      ]).join(", ");

      const city =
        String(
          properties.city ||
            properties.locality ||
            properties.county ||
            "",
        ).trim() || undefined;
      const neighborhood =
        String(
          properties.district ||
            properties.locality ||
            "",
        ).trim() || undefined;
      const country =
        String(properties.country || "").trim() || undefined;
      const countryCode = String(properties.countrycode || "")
        .trim()
        .toUpperCase();

      return {
        label,
        latitude,
        longitude,
        city,
        neighborhood,
        country,
        countryCode: /^[A-Z]{2}$/.test(countryCode)
          ? countryCode
          : undefined,
      };
    })
    .filter(
      (result: GeocodeResult) =>
        result.label &&
        Number.isFinite(result.latitude) &&
        Number.isFinite(result.longitude),
    );
}

export async function geocodeAddress(
  query: string,
): Promise<GeocodeResult[]> {
  const clean = query.trim().slice(0, 180);
  if (clean.length < 3) return [];

  const token = process.env.MAPBOX_ACCESS_TOKEN;

  if (token) {
    try {
      const mapbox = await geocodeWithMapbox(clean, token);
      if (mapbox.length) return mapbox;
    } catch {
      // Fall through to the no-key provider.
    }
  }

  try {
    return await geocodeWithPhoton(clean);
  } catch {
    return [];
  }
}
