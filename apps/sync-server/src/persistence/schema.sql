-- CRDT Collaborative Editor Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table with ownership
CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,
    owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'Untitled Document',
    snapshot    JSONB,
    share_token TEXT UNIQUE,              -- for share-by-link
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Operations log
CREATE TABLE IF NOT EXISTS operations (
    id          SERIAL PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    op          JSONB NOT NULL,
    client_id   INTEGER NOT NULL,
    clock       INTEGER NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Simple sharing table (invite by email or link)
CREATE TABLE IF NOT EXISTS document_shares (
    id            SERIAL PRIMARY KEY,
    document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    shared_with   INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- can be null for public link
    share_token   TEXT UNIQUE,                                     -- used for link sharing
    permission    TEXT NOT NULL DEFAULT 'read',                    -- read | edit
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_operations_document_created 
    ON operations(document_id, created_at);

CREATE INDEX IF NOT EXISTS idx_documents_owner 
    ON documents(owner_id);

CREATE INDEX IF NOT EXISTS idx_document_shares_token 
    ON document_shares(share_token);