import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@/generated/prisma/enums";

const SESSION_COOKIE = "session";

// No fallback secret, ever -- a deployment that forgets to set SESSION_SECRET
// must fail loudly instead of silently signing sessions (including
// SUPER_ADMIN ones) with a value that ships in source control. The getter is
// lazy (evaluated on first real use, not at module import) so this doesn't
// throw during Next.js's build-time static analysis of this module, only
// when a request actually tries to create/read a session.
let cachedSecretKey: Uint8Array | null = null;
function getSecretKey(): Uint8Array {
  if (cachedSecretKey) return cachedSecretKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET environment variable must be set — refusing to start with an insecure default signing key.",
    );
  }
  cachedSecretKey = new TextEncoder().encode(secret);
  return cachedSecretKey;
}

export type SessionPayload = {
  userId: string;
  name: string;
  role: Role;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretKey());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  // getSecretKey() is intentionally outside the try/catch below: a missing
  // SESSION_SECRET must surface as a hard failure, not get swallowed by the
  // "bad/expired token" catch and silently treated as "not signed in".
  const key = getSecretKey();
  try {
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
