-- SQL INSTRUCTIONS:
-- Run this in your Supabase Dashboard SQL Editor to allow Custom FastAPI Auth.

-- 1. Create a table to securely store our custom user credentials
CREATE TABLE IF NOT EXISTS custom_users (
    email TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL
);

-- 2. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 3. Re-create the documents table to use user_email instead of user_id UUID
DROP TABLE IF EXISTS documents;
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  filename TEXT,
  content TEXT,
  embedding VECTOR(1536)
);

-- 4. Re-create the similarity search RPC function to match by email
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding VECTOR(1536),
  match_email TEXT,
  match_count INT DEFAULT 5
) RETURNS TABLE (
  id UUID,
  filename TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    documents.id,
    documents.filename,
    documents.content,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE documents.user_email = match_email
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
$$;
