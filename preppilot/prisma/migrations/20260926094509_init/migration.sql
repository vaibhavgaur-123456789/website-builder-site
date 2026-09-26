-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "language" TEXT NOT NULL DEFAULT 'en',
    "ageRange" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "benchmarkOptIn" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "onboardedAt" DATETIME,
    "lastActiveAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "examDate" TEXT NOT NULL,
    "targetScore" REAL,
    "targetRank" INTEGER,
    "prepLevel" TEXT NOT NULL DEFAULT 'BEGINNER',
    "dailyMinutes" INTEGER NOT NULL DEFAULT 180,
    "preferredSlots" TEXT NOT NULL DEFAULT '["MORNING","EVENING"]',
    "dailyGoalMinutes" INTEGER NOT NULL DEFAULT 180,
    "weeklyGoalMinutes" INTEGER NOT NULL DEFAULT 1260,
    "preferredBlockMin" INTEGER NOT NULL DEFAULT 45,
    "previousMockScores" TEXT NOT NULL DEFAULT '[]',
    "recoveryMode" BOOLEAN NOT NULL DEFAULT false,
    "recoverySince" TEXT,
    "recoveryManual" BOOLEAN NOT NULL DEFAULT false,
    "baseline" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentProfile_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationPrefs" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "studyReminder" BOOLEAN NOT NULL DEFAULT true,
    "revisionReminder" BOOLEAN NOT NULL DEFAULT true,
    "mockReminder" BOOLEAN NOT NULL DEFAULT true,
    "missedTask" BOOLEAN NOT NULL DEFAULT true,
    "examCountdown" BOOLEAN NOT NULL DEFAULT true,
    "dailyBriefing" BOOLEAN NOT NULL DEFAULT true,
    "weeklyReview" BOOLEAN NOT NULL DEFAULT true,
    "quietStart" TEXT NOT NULL DEFAULT '22:30',
    "quietEnd" TEXT NOT NULL DEFAULT '06:30',
    "maxPerDay" INTEGER NOT NULL DEFAULT 4,
    CONSTRAINT "NotificationPrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "durationMinutes" INTEGER NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "marksPerQuestion" REAL NOT NULL DEFAULT 1,
    "negativeMarking" REAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ExamSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ExamSection_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "sectionId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "weightage" REAL NOT NULL DEFAULT 1,
    "isQuantitative" BOOLEAN NOT NULL DEFAULT false,
    "isMemoryBased" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Subject_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subject_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ExamSection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT NOT NULL,
    "parentId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "weightage" INTEGER NOT NULL DEFAULT 3,
    "difficulty" INTEGER NOT NULL DEFAULT 3,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 180,
    "questionTypes" TEXT NOT NULL DEFAULT '["MCQ"]',
    CONSTRAINT "Topic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Topic_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MCQ',
    "stem" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    "difficulty" INTEGER NOT NULL DEFAULT 3,
    "expectedSeconds" INTEGER NOT NULL DEFAULT 45,
    "source" TEXT NOT NULL DEFAULT 'PrepPilot original',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserTopicState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "minutesStudied" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "selfConfidence" INTEGER,
    "lastStudiedAt" DATETIME,
    "completedAt" DATETIME,
    "srsStage" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "nextRevisionOn" TEXT,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "recoveryStep" INTEGER NOT NULL DEFAULT 0,
    "flaggedWeakAt" DATETIME,
    CONSTRAINT "UserTopicState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserTopicState_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "capacityMinutes" INTEGER NOT NULL,
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT NOT NULL DEFAULT '[]',
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "configVersion" TEXT NOT NULL,
    CONSTRAINT "PlanDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
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

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "topicId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'TIMER',
    "date" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "serverStartedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "breakSeconds" INTEGER NOT NULL DEFAULT 0,
    "pauseCount" INTEGER NOT NULL DEFAULT 0,
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "questionsAttempted" INTEGER NOT NULL DEFAULT 0,
    "questionsCorrect" INTEGER NOT NULL DEFAULT 0,
    "difficultyRating" INTEGER,
    "focusRating" INTEGER,
    "energyRating" INTEGER,
    "distractionCount" INTEGER NOT NULL DEFAULT 0,
    "completionPct" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "flags" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudySession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Mock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "subjectId" TEXT,
    "topicId" TEXT,
    "createdById" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Mock_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Mock_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Mock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MockQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mockId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "marks" REAL NOT NULL DEFAULT 1,
    CONSTRAINT "MockQuestion_mockId_fkey" FOREIGN KEY ("mockId") REFERENCES "Mock" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MockQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MockAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mockId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "answers" TEXT NOT NULL DEFAULT '{}',
    "score" REAL,
    "maxScore" REAL,
    "percent" REAL,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "wrong" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "accuracy" REAL,
    "attemptRate" REAL,
    "timeTakenSec" INTEGER NOT NULL DEFAULT 0,
    "analysis" TEXT NOT NULL DEFAULT '{}',
    "analyzedAt" DATETIME,
    CONSTRAINT "MockAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MockAttempt_mockId_fkey" FOREIGN KEY ("mockId") REFERENCES "Mock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "Mistake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "questionAttemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "autoCategory" TEXT NOT NULL,
    "userCorrected" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "nextReviewOn" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Mistake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Mistake_questionAttemptId_fkey" FOREIGN KEY ("questionAttemptId") REFERENCES "QuestionAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Mistake_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Mistake_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RevisionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "scheduledOn" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "completedOn" TEXT,
    "accuracy" REAL,
    "recall" INTEGER,
    "outcome" TEXT,
    "taskId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RevisionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RevisionEvent_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "level" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "target" REAL NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "subjectId" TEXT,
    "topicId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "autoCreated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Goal_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Goal_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Goal_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "XpEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XpEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "xpReward" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "actualMinutes" INTEGER NOT NULL DEFAULT 0,
    "tasksPlanned" INTEGER NOT NULL DEFAULT 0,
    "tasksDone" INTEGER NOT NULL DEFAULT 0,
    "questions" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "revisionsDue" INTEGER NOT NULL DEFAULT 0,
    "revisionsDone" INTEGER NOT NULL DEFAULT 0,
    "mocksTaken" INTEGER NOT NULL DEFAULT 0,
    "focusAvg" REAL,
    "distractions" INTEGER NOT NULL DEFAULT 0,
    "executionScore" INTEGER,
    "focusScore" INTEGER,
    "revisionScore" INTEGER,
    "testingScore" INTEGER,
    "dailyScore" INTEGER,
    "blocker" TEXT,
    "blockerNote" TEXT,
    "reviewedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReadinessSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "components" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "configVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReadinessSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeeklyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "scheduledFor" DATETIME NOT NULL,
    "deliveredAt" DATETIME,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AIConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intent" TEXT,
    "provider" TEXT,
    "contextUsed" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BenchmarkStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "subjectId" TEXT,
    "topicId" TEXT,
    "value" REAL NOT NULL,
    "p25" REAL,
    "p75" REAL,
    "sampleSize" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BenchmarkStat_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BenchmarkStat_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BenchmarkStat_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "props" TEXT NOT NULL DEFAULT '{}',
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerRef" TEXT,
    "currentPeriodEnd" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "resetAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "StudentProfile_examId_idx" ON "StudentProfile"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_slug_key" ON "Exam"("slug");

-- CreateIndex
CREATE INDEX "ExamSection_examId_idx" ON "ExamSection"("examId");

-- CreateIndex
CREATE INDEX "Subject_sectionId_idx" ON "Subject"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_examId_slug_key" ON "Subject"("examId", "slug");

-- CreateIndex
CREATE INDEX "Topic_parentId_idx" ON "Topic"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_subjectId_slug_key" ON "Topic"("subjectId", "slug");

-- CreateIndex
CREATE INDEX "Question_topicId_difficulty_idx" ON "Question"("topicId", "difficulty");

-- CreateIndex
CREATE INDEX "UserTopicState_userId_nextRevisionOn_idx" ON "UserTopicState"("userId", "nextRevisionOn");

-- CreateIndex
CREATE INDEX "UserTopicState_userId_status_idx" ON "UserTopicState"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserTopicState_userId_topicId_key" ON "UserTopicState"("userId", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanDay_userId_date_key" ON "PlanDay"("userId", "date");

-- CreateIndex
CREATE INDEX "Task_userId_date_idx" ON "Task"("userId", "date");

-- CreateIndex
CREATE INDEX "Task_planDayId_idx" ON "Task"("planDayId");

-- CreateIndex
CREATE UNIQUE INDEX "StudySession_clientId_key" ON "StudySession"("clientId");

-- CreateIndex
CREATE INDEX "StudySession_userId_date_idx" ON "StudySession"("userId", "date");

-- CreateIndex
CREATE INDEX "StudySession_userId_status_idx" ON "StudySession"("userId", "status");

-- CreateIndex
CREATE INDEX "Mock_examId_type_idx" ON "Mock"("examId", "type");

-- CreateIndex
CREATE INDEX "Mock_createdById_idx" ON "Mock"("createdById");

-- CreateIndex
CREATE INDEX "MockQuestion_mockId_order_idx" ON "MockQuestion"("mockId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "MockQuestion_mockId_questionId_key" ON "MockQuestion"("mockId", "questionId");

-- CreateIndex
CREATE INDEX "MockAttempt_userId_submittedAt_idx" ON "MockAttempt"("userId", "submittedAt");

-- CreateIndex
CREATE INDEX "MockAttempt_mockId_status_idx" ON "MockAttempt"("mockId", "status");

-- CreateIndex
CREATE INDEX "QuestionAttempt_userId_createdAt_idx" ON "QuestionAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionAttempt_userId_questionId_idx" ON "QuestionAttempt"("userId", "questionId");

-- CreateIndex
CREATE INDEX "QuestionAttempt_mockAttemptId_idx" ON "QuestionAttempt"("mockAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "Mistake_questionAttemptId_key" ON "Mistake"("questionAttemptId");

-- CreateIndex
CREATE INDEX "Mistake_userId_resolved_idx" ON "Mistake"("userId", "resolved");

-- CreateIndex
CREATE INDEX "Mistake_userId_category_idx" ON "Mistake"("userId", "category");

-- CreateIndex
CREATE INDEX "RevisionEvent_userId_scheduledOn_idx" ON "RevisionEvent"("userId", "scheduledOn");

-- CreateIndex
CREATE INDEX "RevisionEvent_userId_topicId_idx" ON "RevisionEvent"("userId", "topicId");

-- CreateIndex
CREATE INDEX "Goal_userId_level_status_idx" ON "Goal"("userId", "level", "status");

-- CreateIndex
CREATE UNIQUE INDEX "XpEvent_dedupeKey_key" ON "XpEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "XpEvent_userId_date_idx" ON "XpEvent"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_code_key" ON "Achievement"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_userId_achievementId_key" ON "UserAchievement"("userId", "achievementId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_userId_date_key" ON "DailyStat"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessSnapshot_userId_date_key" ON "ReadinessSnapshot"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_userId_weekStart_key" ON "WeeklyReport"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_scheduledFor_idx" ON "Notification"("userId", "scheduledFor");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AIConversation_userId_updatedAt_idx" ON "AIConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_createdAt_idx" ON "AIMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "BenchmarkStat_examId_metric_idx" ON "BenchmarkStat"("examId", "metric");

-- CreateIndex
CREATE INDEX "ProductEvent_name_date_idx" ON "ProductEvent"("name", "date");

-- CreateIndex
CREATE INDEX "ProductEvent_userId_date_idx" ON "ProductEvent"("userId", "date");

-- CreateIndex
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- CreateIndex
CREATE INDEX "AdminAuditLog_entity_entityId_idx" ON "AdminAuditLog"("entity", "entityId");
