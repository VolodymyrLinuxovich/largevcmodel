CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS retrieval_profiles (
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('investor', 'founder', 'operator', 'researcher', 'advisor')),
  funding_stage TEXT,
  region TEXT,
  summary TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  embedding_model TEXT NOT NULL,
  source_content_hash TEXT NOT NULL,
  embedding vector(256) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profile_id)
);

CREATE INDEX IF NOT EXISTS retrieval_profiles_user_filters_idx
  ON retrieval_profiles (user_id, role, funding_stage, region);

CREATE INDEX IF NOT EXISTS retrieval_profiles_embedding_hnsw_idx
  ON retrieval_profiles USING hnsw (embedding vector_cosine_ops);
