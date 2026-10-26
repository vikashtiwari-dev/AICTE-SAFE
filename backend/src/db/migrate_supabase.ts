import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

export async function runMigration(password: string) {
  const projectRef = 'dvqlzghhzfezbdtlsnoc';
  const host = 'aws-0-ap-northeast-1.pooler.supabase.com';

  console.log(`🔄 Connecting to Supabase at ${host}:6543...`);

  const client = new Client({
    host,
    port: 6543,
    user: `postgres.${projectRef}`,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  console.log('✅ Connected to Supabase PostgreSQL database successfully!');

  console.log('🚀 Running database schema & national seed data...');
  const sqlPath = path.join(__dirname, 'supabase_master_setup.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  await client.query(sql);
  console.log('✅ Tables created and initial dataset loaded!');

  const tableRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log('\n📊 Tables verified in Supabase:');
  tableRes.rows.forEach(r => console.log(`   ✓ ${r.table_name}`));

  const instRes = await client.query('SELECT COUNT(*) as count FROM institutions;');
  console.log(`\n🏛️ Total Institutions in Supabase: ${instRes.rows[0].count}`);

  const fdrRes = await client.query('SELECT COUNT(*) as count FROM fdrs;');
  console.log(`📜 Total FDRs in Supabase: ${fdrRes.rows[0].count}`);

  const connString = `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@${host}:6543/postgres`;
  console.log('\n============================================================');
  console.log('🔑 READY FOR VERCEL (DATABASE_URL):');
  console.log(connString);
  console.log('============================================================\n');

  await client.end();
  return connString;
}

const pass = process.argv[2] || process.env.SUPABASE_DB_PASSWORD || '';
if (!pass) {
  console.error('Please pass database password as argument or SUPABASE_DB_PASSWORD env variable');
  process.exit(1);
}
runMigration(pass).catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
