const endpoints = [
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const query = `[out:json][timeout:10];
(
  nwr["amenity"="studio"](33.45,-7.75,33.70,-7.45);
  nwr["shop"="photo_studio"](33.45,-7.75,33.70,-7.45);
);
out count;`;

async function probe(endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const started = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
        "User-Agent": "36-marketplace-github-probe/0.1",
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });

    const body = await response.text();
    let total = null;
    if (response.ok) {
      try {
        const payload = JSON.parse(body);
        total = Number(payload?.elements?.[0]?.tags?.total ?? NaN);
        if (!Number.isFinite(total)) total = null;
      } catch {}
    }

    return {
      endpoint,
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
      total,
      preview: response.ok ? null : body.slice(0, 120).replace(/\s+/g, " "),
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      status: 0,
      elapsedMs: Date.now() - started,
      error: error?.name || "UNKNOWN",
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = await Promise.all(endpoints.map(probe));
console.log(JSON.stringify(results, null, 2));
if (!results.some((item) => item.ok)) process.exitCode = 1;
