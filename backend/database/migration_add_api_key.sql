-- Migration: Add api_key column to users table
-- Run this in your Portal database to add API key support

-- Add api_key column if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS api_key VARCHAR(500);

-- Verify the column was added
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'api_key';
