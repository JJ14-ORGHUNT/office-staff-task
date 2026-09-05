import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/auth";
import type { Role } from "@/generated/prisma/enums";

export async function requireRole(
  roles: Role[],
): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  }
  if (!roles.includes(session.role)) {
    return { error: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  }
  return { session };
}

export const ADMIN_ROLES: Role[] = ["ADMIN", "SUPER_ADMIN"];
export const MANAGER_ROLES: Role[] = ["ADMIN", "SUPER_ADMIN", "SUPERVISOR"];
