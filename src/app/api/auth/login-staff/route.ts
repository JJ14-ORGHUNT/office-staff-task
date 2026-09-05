import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const employeeCode = typeof body?.employeeCode === "string" ? body.employeeCode.trim() : "";
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

  if (!employeeCode || !pin) {
    return NextResponse.json({ error: "Please enter your Employee ID and PIN." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { employeeCode } });

  if (!user || !user.active || !user.pinHash) {
    return NextResponse.json({ error: "Employee ID or PIN is not correct." }, { status: 401 });
  }

  const valid = await bcrypt.compare(pin, user.pinHash);
  if (!valid) {
    return NextResponse.json({ error: "Employee ID or PIN is not correct." }, { status: 401 });
  }

  await createSession({ userId: user.id, name: user.name, role: user.role });
  await logAudit({ userId: user.id, action: "LOGIN", entityType: "User", entityId: user.id });

  return NextResponse.json({ ok: true, role: user.role });
}
