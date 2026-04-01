-- SQL INSTRUCTIONS:
-- Run this in your Supabase Dashboard SQL Editor to allow Phase 2 RAG to work.

-- 1. Enable pgvector
create extension if not exists vector;

-- 2. Create documents table
create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  filename text,
  content text,
  embedding vector(1536)
);

-- 3. Create a similarity search RPC function
create or replace function match_documents (
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 5
) returns table (
  id uuid,
  filename text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    documents.id,
    documents.filename,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.user_id = match_user_id
  order by documents.embedding <=> query_embedding
  limit match_count;
$$;
