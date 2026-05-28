INSERT INTO "PlatformSetting" ("key", "value", "updatedAt")
VALUES ('credit_unit_price_cents', '3000', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
