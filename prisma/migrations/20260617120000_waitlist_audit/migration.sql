-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('waiting', 'promoted', 'cancelled');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'waitlist_joined';
ALTER TYPE "NotificationType" ADD VALUE 'waitlist_promoted';

-- CreateTable
CREATE TABLE "ClassWaitlistEntry" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classInstanceId" TEXT NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'waiting',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassWaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassWaitlistEntry_classInstanceId_status_createdAt_idx" ON "ClassWaitlistEntry"("classInstanceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ClassWaitlistEntry_studentId_status_idx" ON "ClassWaitlistEntry"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClassWaitlistEntry_studentId_classInstanceId_key" ON "ClassWaitlistEntry"("studentId", "classInstanceId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "ClassWaitlistEntry" ADD CONSTRAINT "ClassWaitlistEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassWaitlistEntry" ADD CONSTRAINT "ClassWaitlistEntry_classInstanceId_fkey" FOREIGN KEY ("classInstanceId") REFERENCES "ClassInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
