ALTER TABLE "User" ADD COLUMN "platform_fee_waived" BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  UPDATE "User"
  SET "platform_fee_waived" = TRUE
  WHERE "id" = 'cmtuw6sak0000fk5lkk0ceot9'
    AND lower("email") = 'terezav2005@gmail.com';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The verified owner account was not found; platform fee waiver requires operator review.';
  END IF;
END $$;
