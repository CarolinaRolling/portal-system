// ============================================
// MIGRATION: Add Vendor Support to Users Table
// ============================================
// Run this with: node migrations/add-vendor-support.js

const { Pool } = require('pg');

async function runMigration() {
  console.log('========================================');
  console.log('RUNNING VENDOR SUPPORT MIGRATION');
  console.log('========================================\n');

  // Connect to database using Heroku's DATABASE_URL
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? {
      rejectUnauthorized: false
    } : false
  });

  try {
    console.log('ð¡ Connecting to database...');
    const client = await pool.connect();
    console.log('â Connected!\n');

    // Start transaction
    await client.query('BEGIN');

    try {
      // Add is_vendor column
      console.log('â Adding is_vendor column...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS is_vendor BOOLEAN DEFAULT FALSE
      `);
      console.log('â is_vendor column added\n');

      // Add vendor_company_name column
      console.log('â Adding vendor_company_name column...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS vendor_company_name VARCHAR(255)
      `);
      console.log('â vendor_company_name column added\n');

      // Create index
      console.log('ð Creating index for performance...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_is_vendor 
        ON users(is_vendor) 
        WHERE is_vendor = TRUE
      `);
      console.log('â Index created\n');

      // Commit transaction
      await client.query('COMMIT');

      // Verify columns exist
      console.log('ð Verifying migration...');
      const result = await client.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name IN ('is_vendor', 'vendor_company_name')
        ORDER BY column_name
      `);

      console.log('\nð New columns in users table:');
      console.table(result.rows);

      // Show sample data
      const sampleResult = await client.query(`
        SELECT id, username, company_name, is_vendor, vendor_company_name 
        FROM users 
        LIMIT 3
      `);

      console.log('\nð¥ Sample users (showing new columns):');
      console.table(sampleResult.rows);

      client.release();

      console.log('\n========================================');
      console.log('â MIGRATION COMPLETED SUCCESSFULLY!');
      console.log('========================================\n');
      console.log('Next steps:');
      console.log('1. Upload files to GitHub');
      console.log('2. Update auth endpoints in server.js');
      console.log('3. Deploy to Heroku\n');

    } catch (err) {
      // Rollback on error
      await client.query('ROLLBACK');
      throw err;
    }

  } catch (error) {
    console.error('\nâ MIGRATION FAILED!');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration();
