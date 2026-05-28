INSERT INTO "PlatformSetting" ("key", "value", "updatedAt")
VALUES
  ('mp_fee_percent_pix', '0.99', CURRENT_TIMESTAMP),
  ('mp_fee_percent_card', '4.98', CURRENT_TIMESTAMP),
  ('mp_fee_percent_card_installments', '4.98', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
