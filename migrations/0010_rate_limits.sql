-- Add rate limit columns to org_security_policy
ALTER TABLE org_security_policy ADD COLUMN rate_limit_auth_per_min INTEGER NOT NULL DEFAULT 10;
ALTER TABLE org_security_policy ADD COLUMN rate_limit_message_per_min INTEGER NOT NULL DEFAULT 60;
ALTER TABLE org_security_policy ADD COLUMN rate_limit_file_upload_per_min INTEGER NOT NULL DEFAULT 20;
ALTER TABLE org_security_policy ADD COLUMN rate_limit_admin_write_per_min INTEGER NOT NULL DEFAULT 30;
