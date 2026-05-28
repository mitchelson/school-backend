ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "mpFeeInCents" INTEGER;

UPDATE "PlatformSetting"
SET "value" = '7', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'platform_fee_percent' AND "value" = '10';
