import { NextResponse } from "next/server";
import { requireRole, MANAGER_ROLES } from "@/lib/require-role";
import { getMonthCalendarCells } from "@/lib/snapshot";

export async function GET(request: Request) {
  const auth = await requireRole(MANAGER_ROLES);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month")); // 0-11

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
    return NextResponse.json({ error: "Invalid year/month." }, { status: 400 });
  }

  const cells = await getMonthCalendarCells(year, month);
  return NextResponse.json({ year, month, cells });
}
