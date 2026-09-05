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
    "notDoneReason" TEXT,
    "notDoneNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskInstance_taskTemplateId_fkey" FOREIGN KEY ("taskTemplateId") REFERENCES "TaskTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaskInstance" ("completedAt", "createdAt", "date", "id", "notDoneNote", "notDoneReason", "scheduledTime", "startedAt", "status", "taskTemplateId", "updatedAt", "userId") SELECT "completedAt", "createdAt", "date", "id", "notDoneNote", "notDoneReason", "scheduledTime", "startedAt", "status", "taskTemplateId", "updatedAt", "userId" FROM "TaskInstance";
DROP TABLE "TaskInstance";
ALTER TABLE "new_TaskInstance" RENAME TO "TaskInstance";
CREATE INDEX "TaskInstance_userId_date_idx" ON "TaskInstance"("userId", "date");
CREATE UNIQUE INDEX "TaskInstance_taskTemplateId_userId_date_scheduledTime_key" ON "TaskInstance"("taskTemplateId", "userId", "date", "scheduledTime");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
