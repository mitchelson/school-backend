-- Perfil da conta Mercado Pago conectada (exibido no painel admin)

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpAccountEmail" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpAccountNickname" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpAccountName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpAccountSiteId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpProfileSyncedAt" TIMESTAMP(3);
