import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, MANAGER_ROLES, ADMIN_ROLES } from "@/lib/require-role";

export async function GET() {
  const auth = await requireRole(MANAGER_ROLES);
  if ("error" in auth) return auth.error;
  const locations = await prisma.location.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ locations });
}

export async function POST(request: Request) {
  const auth = await requireRole(ADMIN_ROLES);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const location = await prisma.location.create({ data: { name } });
  return NextResponse.json({ ok: true, location });
}
