INSERT INTO "CohortPromoCode" ("id", "code", "discount_percent", "max_redemptions", "expires_at")
VALUES
  ('launch-firstdrop-20261020', 'FIRSTDROP', 100, 20, CURRENT_TIMESTAMP + INTERVAL '14 days'),
  ('launch-build50-20261020', 'BUILD50', 50, 50, CURRENT_TIMESTAMP + INTERVAL '30 days')
ON CONFLICT ("code") DO NOTHING;
