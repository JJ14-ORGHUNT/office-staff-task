import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole, ADMIN_ROLES } from "@/lib/require-role";
import { logAudit } from "@/lib/audit";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(ADMIN_ROLES);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const data: Record<string, unknown> = {};

  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.active === "boolean") data.active = body.active;
  if ("departmentId" in (body ?? {})) data.departmentId = body.departmentId || null;
  if ("locationId" in (body ?? {})) data.locationId = body.locationId || null;
  if (typeof body?.pin === "string" && body.pin.trim()) {
    data.pinHash = await bcrypt.hash(body.pin.trim(), 10);
  }
  if (typeof body?.password === "string" && body.password.trim()) {
    data.passwordHash = await bcrypt.hash(body.password.trim(), 10);
  }

  try {
    await prisma.user.update({ where: { id }, data });
    await logAudit({
      userId: auth.session.userId,
      action: "EMPLOYEE_UPDATED",
      entityType: "User",
      entityId: id,
      detail: JSON.stringify(Object.keys(data)),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not update employee." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(ADMIN_ROLES);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  // Soft-delete: disable instead of removing, to preserve history/audit trail.
  await prisma.user.update({ where: { id }, data: { active: false } });
  await logAudit({
    userId: auth.session.userId,
    action: "EMPLOYEE_DISABLED",
    entityType: "User",
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
