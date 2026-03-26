ALTER TABLE surveys ADD COLUMN IF NOT EXISTS geofence_blocking boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS geofence_violations (
  id serial PRIMARY KEY,
  survey_id integer REFERENCES surveys(id) NOT NULL,
  organization_id integer REFERENCES organizations(id) NOT NULL,
  interviewer_id varchar REFERENCES users(id) NOT NULL,
  latitude double precision,
  longitude double precision,
  neighborhood text NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);
