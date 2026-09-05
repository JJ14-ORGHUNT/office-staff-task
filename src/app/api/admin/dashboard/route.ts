import { NextResponse } from "next/server";
import { requireRole, MANAGER_ROLES } from "@/lib/require-role";
import { getDashboardStats, getRecentActivity, getAttentionRequired } from "@/lib/dashboard";
import { ensureTaskInstancesForAllUsers, todayStr } from "@/lib/tasks";
import { prisma } from "@/lib/prisma";

// Polled every 10s by AdminDashboardClient -- keep this route cheap. Both
// getDashboardStats and getAttentionRequired need today's TaskInstance rows
// to exist; ensure them once here (skipEnsure: true below) rather than each
// independently re-walking every active employee on every poll tick.
export async function GET(request: Request) {
  const auth = await requireRole(MANAGER_ROLES);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || todayStr();

  await ensureTaskInstancesForAllUsers(date);
  const [stats, extraWorkCount, recentActivity, attentionRequired] = await Promise.all([
    getDashboardStats(date, true),
    prisma.extraWorkLog.count({ where: { date } }),
    getRecentActivity(date),
    getAttentionRequired(date, 8, true),
  ]);
  return NextResponse.json({ ...stats, extraWorkCount, recentActivity, attentionRequired });
}
