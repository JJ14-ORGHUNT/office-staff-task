import { getDashboardStats, getRecentActivity, getAttentionRequired } from "@/lib/dashboard";
import { ensureTaskInstancesForAllUsers, todayStr } from "@/lib/tasks";
import { prisma } from "@/lib/prisma";
import AdminDashboardClient from "./AdminDashboardClient";

// Initial paint is server-rendered (fast, no loading flash on first load);
// the client component then polls /api/admin/dashboard in the background to
// stay live without a manual refresh. See AdminDashboardClient.tsx.
export default async function AdminDashboardPage() {
  const date = todayStr();
  // getDashboardStats and getAttentionRequired both need today's TaskInstance
  // rows to exist first; ensure them exactly once here (skipEnsure: true on
  // both calls below) instead of each doing its own redundant walk over
  // every active employee.
  await ensureTaskInstancesForAllUsers(date);
  const [stats, extraWorkCount, recentActivity, attentionRequired] = await Promise.all([
    getDashboardStats(date, true),
    prisma.extraWorkLog.count({ where: { date } }),
    getRecentActivity(date),
    getAttentionRequired(date, 8, true),
  ]);

  return (
    <AdminDashboardClient
      initialStats={stats}
      initialExtraWorkCount={extraWorkCount}
      initialRecentActivity={recentActivity}
      initialAttentionRequired={attentionRequired}
    />
  );
}
