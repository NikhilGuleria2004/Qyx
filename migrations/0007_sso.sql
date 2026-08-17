-- SSO providers table (per-org IdP configuration)
CREATE TABLE sso_providers (
  id              TEXT PRIMARY KEY,          -- sso_...
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  provider_type   TEXT NOT NULL,             -- oidc | saml
  provider_name   TEXT NOT NULL,             -- entra | google | okta | custom
  issuer_url      TEXT,
  client_id       TEXT NOT NULL,
  client_secret   TEXT NOT NULL,
  authorization_url TEXT,
  token_url       TEXT,
  userinfo_url    TEXT,
  jwks_url        TEXT,
  attribute_mapping TEXT NOT NULL DEFAULT '{"email":"email","name":"name"}', -- JSON
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_sso_providers_org ON sso_providers(organization_id);

-- Add SSO feature flag to org_security_policy
ALTER TABLE org_security_policy ADD COLUMN sso_enabled INTEGER NOT NULL DEFAULT 0;
