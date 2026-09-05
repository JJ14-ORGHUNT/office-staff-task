-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TaskStatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskInstanceId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "changedByUserId" TEXT,
    CONSTRAINT "TaskStatusEvent_taskInstanceId_fkey" FOREIGN KEY ("taskInstanceId") REFERENCES "TaskInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskStatusEvent_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TaskStatusEvent" ("at", "fromStatus", "id", "note", "taskInstanceId", "toStatus") SELECT "at", "fromStatus", "id", "note", "taskInstanceId", "toStatus" FROM "TaskStatusEvent";
DROP TABLE "TaskStatusEvent";
ALTER TABLE "new_TaskStatusEvent" RENAME TO "TaskStatusEvent";
CREATE INDEX "TaskStatusEvent_taskInstanceId_idx" ON "TaskStatusEvent"("taskInstanceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
