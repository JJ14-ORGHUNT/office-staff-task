-- CreateTable
CREATE TABLE "TaskStatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskInstanceId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "TaskStatusEvent_taskInstanceId_fkey" FOREIGN KEY ("taskInstanceId") REFERENCES "TaskInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TaskInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskTemplateId" TEXT,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "icon" TEXT,
    "selfAdded" BOOLEAN NOT NULL DEFAULT false,
    "date" TEXT NOT NULL,
    "scheduledTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "durationSec" INTEGER,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "notDoneReason" TEXT,
    "notDoneNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskInstance_taskTemplateId_fkey" FOREIGN KEY ("taskTemplateId") REFERENCES "TaskTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaskInstance" ("completedAt", "createdAt", "date", "icon", "id", "notDoneNote", "notDoneReason", "scheduledTime", "selfAdded", "startedAt", "status", "taskTemplateId", "title", "updatedAt", "userId") SELECT "completedAt", "createdAt", "date", "icon", "id", "notDoneNote", "notDoneReason", "scheduledTime", "selfAdded", "startedAt", "status", "taskTemplateId", "title", "updatedAt", "userId" FROM "TaskInstance";
DROP TABLE "TaskInstance";
ALTER TABLE "new_TaskInstance" RENAME TO "TaskInstance";
CREATE INDEX "TaskInstance_userId_date_idx" ON "TaskInstance"("userId", "date");
CREATE UNIQUE INDEX "TaskInstance_taskTemplateId_userId_date_scheduledTime_key" ON "TaskInstance"("taskTemplateId", "userId", "date", "scheduledTime");
CREATE TABLE "new_TaskTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📋',
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'DAILY',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "scheduledTimes" TEXT NOT NULL,
    "recurrenceDays" TEXT,
    "recurrenceDayOfMonth" INTEGER,
    "specialDate" DATETIME,
    "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 15,
    "durationTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "departmentId" TEXT,
    "locationId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaskTemplate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaskTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TaskTemplate" ("active", "archived", "createdAt", "createdById", "departmentId", "description", "icon", "id", "locationId", "priority", "recurrenceDayOfMonth", "recurrenceDays", "reminderMinutesBefore", "scheduledTimes", "specialDate", "title", "type", "updatedAt") SELECT "active", "archived", "createdAt", "createdById", "departmentId", "description", "icon", "id", "locationId", "priority", "recurrenceDayOfMonth", "recurrenceDays", "reminderMinutesBefore", "scheduledTimes", "specialDate", "title", "type", "updatedAt" FROM "TaskTemplate";
DROP TABLE "TaskTemplate";
ALTER TABLE "new_TaskTemplate" RENAME TO "TaskTemplate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TaskStatusEvent_taskInstanceId_idx" ON "TaskStatusEvent"("taskInstanceId");
