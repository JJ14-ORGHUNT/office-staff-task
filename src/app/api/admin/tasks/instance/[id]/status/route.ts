import { NextResponse } from "next/server";
import { requireRole, MANAGER_ROLES } from "@/lib/require-role";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { todayStr } from "@/lib/tasks";
import { invalidateSnapshotForDate } from "@/lib/snapshot";

const VALID_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "DONE", "NOT_DONE"];

// Admin/supervisor override of another employee's task status -- backs drag
// and drop on the admin Kanban board. Mirrors the staff-driven logic in
// src/app/api/tasks/instance/route.ts (startedAt/durationSec computation,
// TaskStatusEvent + AuditLog rows), but is not restricted to the task's own
// owner, and stamps `changedByUserId` on the event so the audit trail can
// tell an admin override apart from a self-update (which leaves it null).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(MANAGER_ROLES);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const status = typeof body?.status === "string" ? body.status : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : undefined;
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : undefined;

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (status === "NOT_DONE" && !reason) {
    return NextResponse.json({ error: "A reason is required to mark a task Not Done." }, { status: 400 });
  }

  const instance = await prisma.taskInstance.findUnique({ where: { id } });
  if (!instance) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  // Idempotency guard: a resubmit of the exact same status (and, for
  // NOT_DONE, the same reason) is a no-op -- return the current instance
  // unchanged instead of re-stamping completedAt/durationSec or writing a
  // duplicate TaskStatusEvent. Covers double-clicks and client retries.
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

  // startedAt handling:
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

  // Wrapped in a transaction so the conditional update, the TaskStatusEvent
  // row, and the audit log all commit atomically. The update's `where` also
  // requires `status: instance.status` (the pre-fetched snapshot) as a
  // lightweight optimistic-concurrency check: if another request changed the
  // status in between our read and this write, `count` comes back 0 and we
  // report a 409 instead of silently overwriting with a stale `fromStatus`.
  // This narrows the race window (SQLite serializes concurrent writers
  // inside a transaction) but a fully robust version would carry an explicit
  // `version`/`updatedAt` column checked the same way -- left for a future
  // pass since plain status-equality already covers the realistic case here.
  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.taskInstance.updateMany({
      where: { id, status: instance.status },
      data: {
        status: status as never,
        startedAt,
        completedAt,
        durationSec,
        notDoneReason: status === "NOT_DONE" ? reason ?? "Other" : null,
        notDoneNote: status === "NOT_DONE" ? note ?? null : null,
      },
    });
    if (count === 0) {
      return null;
    }

    await tx.taskStatusEvent.create({
      data: {
        taskInstanceId: id,
        fromStatus: instance.status,
        toStatus: status,
        note: status === "NOT_DONE" ? reason ?? "Other" : null,
        changedByUserId: auth.session.userId,
      },
    });

    await logAudit(
      {
        userId: auth.session.userId,
        action: "TASK_STATUS_OVERRIDDEN",
        entityType: "TaskInstance",
        entityId: id,
        detail: `${instance.status} -> ${status} (admin override)`,
      },
      tx,
    );

    return tx.taskInstance.findUniqueOrThrow({ where: { id } });
  });

  if (!result) {
    return NextResponse.json(
      { error: "This task was just changed elsewhere. Please refresh and try again." },
      { status: 409 },
    );
  }

  // A correction to an already-finished day must bust that day's cached
  // DailySnapshot, or the frozen historical rollup silently drifts out of
  // sync with the TaskInstance row we just changed (today is never cached,
  // so no invalidation is needed for same-day edits).
  if (result.date !== todayStr()) {
    await invalidateSnapshotForDate(result.userId, result.date);
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    startedAt: result.startedAt ? result.startedAt.toISOString() : null,
    completedAt: result.completedAt ? result.completedAt.toISOString() : null,
    durationSec: result.durationSec,
  });
}
