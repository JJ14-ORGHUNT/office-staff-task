import { NextResponse } from "next/server";
import { requireRole, MANAGER_ROLES } from "@/lib/require-role";
import { getOrgDaySummary } from "@/lib/snapshot";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const auth = await requireRole(MANAGER_ROLES);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? "";

  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  const summary = await getOrgDaySummary(date);
  return NextResponse.json(summary);
}
