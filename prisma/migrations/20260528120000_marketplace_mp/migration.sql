-- Mercado Pago marketplace: admin seller OAuth + platform fee + payment split metadata

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpUserId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpAccessToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpConnectedAt" TIMESTAMP(3);

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "applicationFeeInCents" INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "sellerAmountInCents" INTEGER;

CREATE TABLE IF NOT EXISTS "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

INSERT INTO "PlatformSetting" ("key", "value", "updatedAt")
VALUES ('platform_fee_percent', '10', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
