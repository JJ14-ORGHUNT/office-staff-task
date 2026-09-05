import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;
  const instance = await prisma.taskInstance.findUnique({ where: { id } });

  if (!instance || instance.userId !== session.userId || !instance.selfAdded) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.taskInstance.delete({ where: { id } });
  await logAudit({
    userId: session.userId,
    action: "SELF_TASK_REMOVED",
    entityType: "TaskInstance",
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
