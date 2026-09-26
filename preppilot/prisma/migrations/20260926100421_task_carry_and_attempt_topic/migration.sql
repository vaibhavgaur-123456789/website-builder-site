/*
  Warnings:

  - Added the required column `topicId` to the `QuestionAttempt` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QuestionAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "mockAttemptId" TEXT,
    "sessionId" TEXT,
    "selectedIndex" INTEGER,
    "isCorrect" BOOLEAN NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'ATTEMPTED',
    "timeSpentSec" INTEGER NOT NULL DEFAULT 0,
    "confidence" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionAttempt_mockAttemptId_fkey" FOREIGN KEY ("mockAttemptId") REFERENCES "MockAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_QuestionAttempt" ("confidence", "createdAt", "decision", "id", "isCorrect", "mockAttemptId", "questionId", "selectedIndex", "sessionId", "timeSpentSec", "userId") SELECT "confidence", "createdAt", "decision", "id", "isCorrect", "mockAttemptId", "questionId", "selectedIndex", "sessionId", "timeSpentSec", "userId" FROM "QuestionAttempt";
DROP TABLE "QuestionAttempt";
ALTER TABLE "new_QuestionAttempt" RENAME TO "QuestionAttempt";
CREATE INDEX "QuestionAttempt_userId_createdAt_idx" ON "QuestionAttempt"("userId", "createdAt");
CREATE INDEX "QuestionAttempt_userId_questionId_idx" ON "QuestionAttempt"("userId", "questionId");
CREATE INDEX "QuestionAttempt_userId_topicId_createdAt_idx" ON "QuestionAttempt"("userId", "topicId", "createdAt");
CREATE INDEX "QuestionAttempt_mockAttemptId_idx" ON "QuestionAttempt"("mockAttemptId");
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planDayId" TEXT,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subjectId" TEXT,
    "topicId" TEXT,
    "mockId" TEXT,
    "startTime" TEXT,
    "plannedMinutes" INTEGER NOT NULL,
    "questionTarget" INTEGER NOT NULL DEFAULT 0,
    "objective" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priorityScore" REAL NOT NULL DEFAULT 0,
    "reasons" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "missedAction" TEXT,
    "missedReason" TEXT,
    "carryOn" TEXT,
    "carryMinutes" INTEGER NOT NULL DEFAULT 0,
    "carryConsumed" BOOLEAN NOT NULL DEFAULT false,
    "carryCount" INTEGER NOT NULL DEFAULT 0,
    "carriedFromId" TEXT,
    "actualMinutes" INTEGER NOT NULL DEFAULT 0,
    "questionsDone" INTEGER NOT NULL DEFAULT 0,
    "questionsCorrect" INTEGER NOT NULL DEFAULT 0,
    "completionPct" INTEGER NOT NULL DEFAULT 0,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_planDayId_fkey" FOREIGN KEY ("planDayId") REFERENCES "PlanDay" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("actualMinutes", "carriedFromId", "completedAt", "completionPct", "createdAt", "date", "id", "isOptional", "missedAction", "missedReason", "mockId", "objective", "order", "planDayId", "plannedMinutes", "priorityScore", "questionTarget", "questionsCorrect", "questionsDone", "reasons", "source", "startTime", "status", "subjectId", "title", "topicId", "type", "updatedAt", "userId") SELECT "actualMinutes", "carriedFromId", "completedAt", "completionPct", "createdAt", "date", "id", "isOptional", "missedAction", "missedReason", "mockId", "objective", "order", "planDayId", "plannedMinutes", "priorityScore", "questionTarget", "questionsCorrect", "questionsDone", "reasons", "source", "startTime", "status", "subjectId", "title", "topicId", "type", "updatedAt", "userId" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_userId_date_idx" ON "Task"("userId", "date");
CREATE INDEX "Task_planDayId_idx" ON "Task"("planDayId");
CREATE INDEX "Task_userId_carryConsumed_carryOn_idx" ON "Task"("userId", "carryConsumed", "carryOn");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
