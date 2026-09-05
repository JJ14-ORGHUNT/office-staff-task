import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { todayStr } from "@/lib/tasks";
import { invalidateSnapshotForDate } from "@/lib/snapshot";

const VALID_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "DONE", "NOT_DONE"];

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const instanceId = typeof body?.instanceId === "string" ? body.instanceId : "";
  const status = typeof body?.status === "string" ? body.status : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : undefined;
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : undefined;

  if (!instanceId || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (status === "NOT_DONE" && !reason) {
    return NextResponse.json({ error: "A reason is required to mark a task Not Done." }, { status: 400 });
  }

  const instance = await prisma.taskInstance.findUnique({ where: { id: instanceId } });
  if (!instance || instance.userId !== session.userId) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  // Idempotency guard: a resubmit of the exact same status (and, for
  // NOT_DONE, the same reason) is a no-op -- return the current instance
  // unchanged instead of re-stamping completedAt/durationSec or writing a
  // duplicate TaskStatusEvent. Covers double-taps and client retries.
  const isNoOp =
    status === instance.status && (status !== "NOT_DONE" || (reason ?? "Other") === instance.notDoneReason);
  if (isNoOp) {
    return NextResponse.json({
      ok: true,
      status: instance.status,
      startedAt: instance.startedAt ? instance.startedAt.toISOString() : null,
      completedAt: instance.completedAt ? instance.completedAt.toISOString() : null,
      durationSec: instance.durationSec,
    });
  }

  const now = new Date();

  // startedAt handling -- mirrors the admin override route
  // (src/app/api/admin/tasks/instance/[id]/status/route.ts):
  // - NOT_STARTED: always clears startedAt -- the task hasn't started again
  //   yet, so a later completion must not measure against a stale value.
  // - IN_PROGRESS while the *current* status is DONE/NOT_DONE (a "redo" of a
  //   previously-finished task): stamp a fresh startedAt, discarding the
  //   stale one from the previous work cycle.
  // - IN_PROGRESS on the normal forward path (current status NOT_STARTED)
  //   with no startedAt yet: fill it in, same as before.
  // - Direct NOT_STARTED -> DONE: startedAt is left untouched (still null) --
  //   see the durationSec comment below for why.
  let startedAt = instance.startedAt;
  if (status === "NOT_STARTED") {
    startedAt = null;
  } else if (status === "IN_PROGRESS") {
    if (instance.status === "DONE" || instance.status === "NOT_DONE") {
      startedAt = now;
    } else if (!instance.startedAt) {
      startedAt = now;
    }
  }

  const completedAt = status === "DONE" || status === "NOT_DONE" ? now : null;
  // Compute a real duration for either terminal status whenever there's a
  // genuine startedAt to measure from. A direct NOT_STARTED -> DONE/NOT_DONE
  // move never had a real start time (see above), so this correctly leaves
  // durationSec null (unknown/not tracked) instead of fabricating a fake 0s
  // duration.
  const durationSec =
    (status === "DONE" || status === "NOT_DONE") && startedAt
      ? Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000))
      : null;

  const updated = await prisma.taskInstance.update({
    where: { id: instanceId },
    data: {
      status: status as never,
      startedAt,
      completedAt,
      durationSec,
      notDoneReason: status === "NOT_DONE" ? reason ?? "Other" : null,
      notDoneNote: status === "NOT_DONE" ? note ?? null : null,
    },
  });

  await prisma.taskStatusEvent.create({
    data: {
      taskInstanceId: instanceId,
      fromStatus: instance.status,
      toStatus: status,
      note: status === "NOT_DONE" ? reason ?? "Other" : null,
    },
  });

  await logAudit({
    userId: session.userId,
    action: "TASK_STATUS_CHANGED",
    entityType: "TaskInstance",
    entityId: instanceId,
    detail: `${instance.status} -> ${status}`,
  });

  // Same cache-busting requirement as the admin override route: a change to
  // an already-finished day's instance must invalidate that day's cached
  // DailySnapshot (today is never cached, so no-op for same-day updates).
  if (updated.date !== todayStr()) {
    await invalidateSnapshotForDate(updated.userId, updated.date);
  }

  return NextResponse.json({
    ok: true,
    status: updated.status,
    startedAt: updated.startedAt ? updated.startedAt.toISOString() : null,
    completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
    durationSec: updated.durationSec,
  });
}
