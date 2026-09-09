-- Password-reset and e-mail verification tokens are stored as SHA-256 hashes
-- from now on (the raw token only travels in the e-mail). Plaintext tokens
-- that are still stored can no longer match a hashed lookup, so they are
-- cleared; affected users simply request a new link.
UPDATE "users"
SET "reset_token" = NULL,
    "reset_token_expires" = NULL,
    "email_verification_token" = NULL,
    "email_verification_expires" = NULL
WHERE "reset_token" IS NOT NULL
   OR "email_verification_token" IS NOT NULL;
