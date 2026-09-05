-- CreateTable
CREATE TABLE "DailySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "totalTasks" INTEGER NOT NULL,
    "completed" INTEGER NOT NULL,
    "inProgress" INTEGER NOT NULL,
    "notDone" INTEGER NOT NULL,
    "overdueCount" INTEGER NOT NULL,
    "totalDurationSec" INTEGER NOT NULL,
    "completionPct" INTEGER NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DailySnapshot_date_idx" ON "DailySnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailySnapshot_userId_date_key" ON "DailySnapshot"("userId", "date");
