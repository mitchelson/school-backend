-- Garante tabela e chaves mínimas (idempotente). Rode após migrate deploy se /credits/pricing retornar 500.

CREATE TABLE IF NOT EXISTS "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

INSERT INTO "PlatformSetting" ("key", "value", "updatedAt")
VALUES
  ('platform_fee_percent', '7', CURRENT_TIMESTAMP),
  ('credit_unit_price_cents', '3000', CURRENT_TIMESTAMP),
  ('mp_fee_percent_pix', '0.99', CURRENT_TIMESTAMP),
  ('mp_fee_percent_card', '4.98', CURRENT_TIMESTAMP),
  ('mp_fee_percent_card_installments', '4.98', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpUserId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpAccessToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpConnectedAt" TIMESTAMP(3);
