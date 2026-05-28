-- Reparo idempotente para 20260528140500_class_series (P3009 em produção).

DO $$ BEGIN
  CREATE TYPE "ClassScheduleType" AS ENUM ('single', 'weekly', 'biweekly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ClassSeries" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassSeries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ClassInstance" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;

CREATE INDEX IF NOT EXISTS "ClassInstance_seriesId_idx" ON "ClassInstance"("seriesId");

DO $$ BEGIN
  ALTER TABLE "ClassInstance"
    ADD CONSTRAINT "ClassInstance_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "ClassSeries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
