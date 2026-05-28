-- CreateEnum
CREATE TYPE "ClassScheduleType" AS ENUM ('single', 'weekly', 'biweekly');

-- CreateTable
CREATE TABLE "ClassSeries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "maxStudents" INTEGER NOT NULL,
    "location" TEXT,
    "scheduleType" "ClassScheduleType" NOT NULL DEFAULT 'single',
    "weekdays" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSeries_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ClassInstance" ADD COLUMN "seriesId" TEXT;

-- CreateIndex
CREATE INDEX "ClassInstance_seriesId_idx" ON "ClassInstance"("seriesId");

-- AddForeignKey
ALTER TABLE "ClassInstance" ADD CONSTRAINT "ClassInstance_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ClassSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
