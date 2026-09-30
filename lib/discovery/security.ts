function normalizeHost(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

function privateIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }

  const [a, b] = numbers;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function privateIpv6(hostname: string) {
  const host = normalizeHost(hostname);
  return (
    host === "::1" ||
    host === "::" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd")
  );
}

export function isUnsafeDiscoveryProofUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return true;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  if (url.username || url.password) return true;

  const host = normalizeHost(url.hostname);
  if (!host) return true;

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    privateIpv4(host) ||
    privateIpv6(host)
  ) {
    return true;
  }

  return false;
}
