import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole, MANAGER_ROLES, ADMIN_ROLES } from "@/lib/require-role";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requireRole(MANAGER_ROLES);
  if ("error" in auth) return auth.error;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      email: true,
      role: true,
      active: true,
      departmentId: true,
      locationId: true,
      department: { select: { name: true } },
      location: { select: { name: true } },
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      employeeCode: u.employeeCode,
      email: u.email,
      role: u.role,
      active: u.active,
      department: u.department?.name ?? null,
      location: u.location?.name ?? null,
      departmentId: u.departmentId,
      locationId: u.locationId,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireRole(ADMIN_ROLES);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const role = typeof body?.role === "string" ? body.role : "STAFF";
  const employeeCode = typeof body?.employeeCode === "string" ? body.employeeCode.trim() : "";
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const departmentId = typeof body?.departmentId === "string" && body.departmentId ? body.departmentId : null;
  const locationId = typeof body?.locationId === "string" && body.locationId ? body.locationId : null;

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  // Privilege escalation guard: creating an ADMIN/SUPER_ADMIN-tier account is
  // restricted to callers who are themselves SUPER_ADMIN. A plain ADMIN is
  // in MANAGER_ROLES/ADMIN_ROLES (so they can reach this endpoint at all and
  // create ordinary STAFF/SUPERVISOR accounts) but must not be able to mint
  // another ADMIN or SUPER_ADMIN account for themselves or anyone else.
  if ((role === "ADMIN" || role === "SUPER_ADMIN") && auth.session.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only a Super Admin can create an Admin or Super Admin account." },
      { status: 403 },
    );
  }

  if (role === "STAFF") {
    if (!employeeCode || !pin) {
      return NextResponse.json({ error: "Employee ID and PIN are required for staff." }, { status: 400 });
    }
  } else {
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required for this role." }, { status: 400 });
    }
  }

  try {
    const user = await prisma.user.create({
      data: {
        name,
        role: role as never,
        employeeCode: role === "STAFF" ? employeeCode : null,
        pinHash: role === "STAFF" ? await bcrypt.hash(pin, 10) : null,
        email: role !== "STAFF" ? email : null,
        passwordHash: role !== "STAFF" ? await bcrypt.hash(password, 10) : null,
        departmentId,
        locationId,
      },
    });

    await logAudit({
      userId: auth.session.userId,
      action: "EMPLOYEE_CREATED",
      entityType: "User",
      entityId: user.id,
      detail: name,
    });

    return NextResponse.json({ ok: true, id: user.id });
  } catch {
    return NextResponse.json(
      { error: "Could not create employee. Employee ID or email may already be used." },
      { status: 400 },
    );
  }
}
