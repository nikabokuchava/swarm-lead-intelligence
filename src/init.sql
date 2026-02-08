CREATE TABLE IF NOT EXISTS "Lead" (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    website TEXT,
    address TEXT,
    source TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
