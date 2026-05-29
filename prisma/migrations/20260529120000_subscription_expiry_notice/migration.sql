-- Track which validity period received the 5-day expiry email (avoid duplicates).
ALTER TABLE "Subscription" ADD COLUMN "lastExpiryNoticeValidUntil" TIMESTAMP(3);
