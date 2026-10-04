CREATE TABLE race_state (
  race text PRIMARY KEY,
  pst double precision NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  etag text,
  finalized boolean NOT NULL DEFAULT false,
  source_updated_at text,
  candidates jsonb NOT NULL
);

CREATE TABLE snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  race text NOT NULL,
  pst double precision NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  candidates jsonb NOT NULL
);

CREATE INDEX snapshots_race_pst ON snapshots (race, pst);
