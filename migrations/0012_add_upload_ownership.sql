CREATE TABLE IF NOT EXISTS upload_ownership (
  object_id text PRIMARY KEY,
  user_id varchar REFERENCES users(id) NOT NULL,
  organization_id integer REFERENCES organizations(id),
  created_at timestamp DEFAULT now()
);
