import Database from 'better-sqlite3';

const db = new Database('./server/research.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

const cols = db.prepare('PRAGMA table_info(paper_chunks)').all();
console.log('paper_chunks columns:', JSON.stringify(cols));

// Also check if any chunks exist
const count = db.prepare('SELECT COUNT(*) as c FROM paper_chunks').get();
console.log('chunk count:', count);
