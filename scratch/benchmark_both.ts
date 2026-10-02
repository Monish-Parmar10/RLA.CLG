import 'dotenv/config';
import Database from 'better-sqlite3';
import { chatWithPaper } from '../server/ai.js';

const db = new Database('data/researchlens.db');

async function testBoth() {
  const paper = db.prepare('SELECT * FROM papers LIMIT 1').get();
  const testUserId = paper.user_id;

  const questions = [
    'What methodology was used?',
    'What are the limitations?',
    'How does cloud computing support e-learning?',
    'What are the challenges of cloud adoption discussed in the paper?'
  ];

  console.log('==================================================================');
  console.log('   FULL COMPARISON: GEMINI vs OLLAMA ON LIVE PAPER QUESTIONS      ');
  console.log('==================================================================\n');

  for (const q of questions) {
    console.log(`\n======================================================`);
    console.log(`QUESTION: "${q}"`);
    console.log(`======================================================`);

    // 1. Gemini
    db.prepare('INSERT OR REPLACE INTO user_settings (id, user_id, ai_provider) VALUES (?, ?, ?)').run('test-user-setting-1', testUserId, 'gemini');
    const geminiRes = await chatWithPaper(paper, q, [], testUserId);
    console.log(`\n[GEMINI (Model: ${process.env.GEMINI_MODEL})]:`);
    console.log(geminiRes.text);
    console.log(`Sources:`, JSON.stringify(geminiRes.sources));

    // 2. Ollama
    db.prepare('INSERT OR REPLACE INTO user_settings (id, user_id, ai_provider) VALUES (?, ?, ?)').run('test-user-setting-1', testUserId, 'ollama');
    const ollamaRes = await chatWithPaper(paper, q, [], testUserId);
    console.log(`\n[OLLAMA (Model: ${process.env.OLLAMA_MODEL})]:`);
    console.log(ollamaRes.text);
    console.log(`Sources:`, JSON.stringify(ollamaRes.sources));
  }
}

testBoth().catch(console.error);
