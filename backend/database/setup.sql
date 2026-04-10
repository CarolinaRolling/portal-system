-- Portal Database Setup
-- This creates the users table for authentication
-- Run this in your PORTAL database (not Carolina)

-- Drop existing users table if you want fresh start
-- DROP TABLE IF EXISTS users CASCADE;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  api_key VARCHAR(500),
  role VARCHAR(20) DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create admin user
-- Username: admin
-- Password: admin123
INSERT INTO users (username, email, password_hash, company_name, role)
VALUES (
  'admin',
  'admin@portal.com',
  '$2a$10$YQiiz/L.MK8qJJe5pGz1COvVzF8ZN8qJJK5y6Xn8aL.zPzJz.LqFu',
  'Nowell',
  'admin'
)
ON CONFLICT (username) DO NOTHING;

-- Verify
SELECT username, email, company_name, role FROM users;
