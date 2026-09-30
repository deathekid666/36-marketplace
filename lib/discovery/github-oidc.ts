import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "36-marketplace-global-contacts";
const EXPECTED_REPOSITORY = "deathekid666/36-marketplace";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_WORKFLOW_SUFFIX = "/.github/workflows/global-studio-contacts.yml@refs/heads/main";

type JwtHeader = {
  alg?: unknown;
  kid?: unknown;
};

type JwtClaims = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
  repository?: unknown;
  ref?: unknown;
  workflow_ref?: unknown;
  event_name?: unknown;
};

function jsonPart<T>(part: string): T {
  const decoded = Buffer.from(part, "base64url").toString("utf8");
  return JSON.parse(decoded) as T;
}

function audienceMatches(value: unknown) {
  if (typeof value === "string") return value === AUDIENCE;
  return Array.isArray(value) && value.some((entry) => entry === AUDIENCE);
}

export async function verifyGlobalImportOidcToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("OIDC_TOKEN_INVALID");

  const header = jsonPart<JwtHeader>(parts[0]);
  const claims = jsonPart<JwtClaims>(parts[1]);

  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("OIDC_TOKEN_INVALID");
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER) throw new Error("OIDC_ISSUER_INVALID");
  if (!audienceMatches(claims.aud)) throw new Error("OIDC_AUDIENCE_INVALID");
  if (typeof claims.exp !== "number" || claims.exp <= now) {
    throw new Error("OIDC_TOKEN_EXPIRED");
  }
  if (typeof claims.nbf === "number" && claims.nbf > now + 30) {
    throw new Error("OIDC_TOKEN_NOT_ACTIVE");
  }
  if (typeof claims.iat !== "number" || claims.iat < now - 900 || claims.iat > now + 60) {
    throw new Error("OIDC_TOKEN_AGE_INVALID");
  }

  if (claims.repository !== EXPECTED_REPOSITORY || claims.ref !== EXPECTED_REF) {
    throw new Error("OIDC_REPOSITORY_INVALID");
  }

  if (
    typeof claims.workflow_ref !== "string" ||
    !claims.workflow_ref.endsWith(EXPECTED_WORKFLOW_SUFFIX)
  ) {
    throw new Error("OIDC_WORKFLOW_INVALID");
  }

  if (claims.event_name !== "push" && claims.event_name !== "workflow_dispatch" && claims.event_name !== "schedule") {
    throw new Error("OIDC_EVENT_INVALID");
  }

  const discovery = await fetch(ISSUER + "/.well-known/openid-configuration", {
    cache: "force-cache",
  });
  if (!discovery.ok) throw new Error("OIDC_DISCOVERY_FAILED");
  const discoveryJson = (await discovery.json()) as { jwks_uri?: unknown };
  if (typeof discoveryJson.jwks_uri !== "string") throw new Error("OIDC_DISCOVERY_INVALID");

  const jwksResponse = await fetch(discoveryJson.jwks_uri, {
    cache: "force-cache",
  });
  if (!jwksResponse.ok) throw new Error("OIDC_JWKS_FAILED");

  const jwks = (await jwksResponse.json()) as {
    keys?: Array<Record<string, unknown>>;
  };

  const key = jwks.keys?.find((entry) => entry.kid === header.kid);
  if (!key) throw new Error("OIDC_SIGNING_KEY_NOT_FOUND");

  const publicKey = createPublicKey({
    key: key as JsonWebKey,
    format: "jwk",
  });

  const verified = verify(
    "RSA-SHA256",
    Buffer.from(parts[0] + "." + parts[1]),
    publicKey,
    Buffer.from(parts[2], "base64url"),
  );

  if (!verified) throw new Error("OIDC_SIGNATURE_INVALID");

  return {
    repository: String(claims.repository),
    ref: String(claims.ref),
    workflowRef: String(claims.workflow_ref),
    eventName: String(claims.event_name),
  };
}
