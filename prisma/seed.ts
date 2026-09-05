import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  const bengaluru = await prisma.location.upsert({
    where: { id: "loc-bengaluru" },
    update: {},
    create: { id: "loc-bengaluru", name: "Bengaluru Office" },
  });

  const facilities = await prisma.department.upsert({
    where: { id: "dept-facilities" },
    update: {},
    create: { id: "dept-facilities", name: "Facilities" },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@example.com",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: "ADMIN",
      locationId: bengaluru.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "supervisor@example.com" },
    update: {},
    create: {
      name: "Supervisor User",
      email: "supervisor@example.com",
      passwordHash: await bcrypt.hash("super123", 10),
      role: "SUPERVISOR",
      locationId: bengaluru.id,
      departmentId: facilities.id,
    },
  });

  const staffData = [
    { code: "EMP001", name: "Ramesh Kumar" },
    { code: "EMP002", name: "Suresh Babu" },
    { code: "EMP003", name: "Priya Sharma" },
  ];

  const staffUsers = [];
  for (const s of staffData) {
    const u = await prisma.user.upsert({
      where: { employeeCode: s.code },
      update: {},
      create: {
        name: s.name,
        employeeCode: s.code,
        pinHash: await bcrypt.hash("1234", 10),
        role: "STAFF",
        locationId: bengaluru.id,
        departmentId: facilities.id,
      },
    });
    staffUsers.push(u);
  }

  const taskDefs = [
    {
      id: "task-clean-reception",
      title: "Clean Reception",
      icon: "🧹",
      type: "DAILY" as const,
      scheduledTimes: "09:00",
      priority: "NORMAL" as const,
    },
    {
      id: "task-check-pantry",
      title: "Check Pantry",
      icon: "🫖",
      type: "DAILY" as const,
      scheduledTimes: "09:30,12:30,15:30",
      priority: "NORMAL" as const,
    },
    {
      id: "task-check-restrooms",
      title: "Check Restrooms",
      icon: "🚻",
      type: "DAILY" as const,
      scheduledTimes: "10:00,14:00",
      priority: "HIGH" as const,
    },
    {
      id: "task-water-plants",
      title: "Water the Plants",
      icon: "🪴",
      type: "DAILY" as const,
      scheduledTimes: "08:30",
      priority: "NORMAL" as const,
    },
    {
      id: "task-clean-storage",
      title: "Clean Storage Room",
      icon: "📦",
      type: "WEEKLY" as const,
      scheduledTimes: "11:00",
      recurrenceDays: "6", // Saturday
      priority: "NORMAL" as const,
    },
  ];

  for (const t of taskDefs) {
    const template = await prisma.taskTemplate.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        title: t.title,
        icon: t.icon,
        type: t.type,
        scheduledTimes: t.scheduledTimes,
        recurrenceDays: t.recurrenceDays,
        priority: t.priority,
        reminderMinutesBefore: 15,
        locationId: bengaluru.id,
        departmentId: facilities.id,
        createdById: admin.id,
      },
    });

    for (const u of staffUsers) {
      await prisma.taskAssignment.upsert({
        where: { taskTemplateId_userId: { taskTemplateId: template.id, userId: u.id } },
        update: {},
        create: { taskTemplateId: template.id, userId: u.id },
      });
    }
  }

  console.log("Seed complete.");
  console.log("Admin login: admin@example.com / admin123");
  console.log("Supervisor login: supervisor@example.com / super123");
  console.log("Staff login: Employee ID EMP001/EMP002/EMP003, PIN 1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
