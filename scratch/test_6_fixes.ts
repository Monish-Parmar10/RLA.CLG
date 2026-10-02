import 'dotenv/config';
import Database from 'better-sqlite3';
import { chatWithPaper, getProvider, analyzePaper, reviewPaper, generateSummary } from '../server/ai.js';

const db = new Database('data/researchlens.db');

async function runTests() {
  console.log('====================================================');
  console.log('   TESTING 6 FIXES WITH RAW EVIDENCE                ');
  console.log('====================================================\n');

  // Find a paper in the database
  const paper = db.prepare('SELECT * FROM papers LIMIT 1').get() as any;
  if (!paper) {
    console.error('No paper found in DB! Please make sure at least one paper is indexed.');
    process.exit(1);
  }
  console.log(`Using paper: "${paper.title || paper.original_name}" (ID: ${paper.id})\n`);

  // Ensure test user has user_settings
  const testUserId = paper.user_id;

  // ----------------------------------------------------
  // TEST 1: LOG MISMATCH & MODEL NAME PER PROVIDER
  // ----------------------------------------------------
  console.log('--- TEST 1: LOG & MODEL NAME PER PROVIDER ---');
  console.log('Configured GEMINI_MODEL:', process.env.GEMINI_MODEL);
  console.log('Configured OLLAMA_MODEL:', process.env.OLLAMA_MODEL);

  // Set user setting to Gemini
  db.prepare('INSERT OR REPLACE INTO user_settings (id, user_id, ai_provider) VALUES (?, ?, ?)').run('test-user-setting-1', testUserId, 'gemini');
  console.log('\n[Gemini Call Log Test]');
  await chatWithPaper(paper, 'Summarize the core premise in one sentence.', [], testUserId);

  // Set user setting to Ollama
  db.prepare('INSERT OR REPLACE INTO user_settings (id, user_id, ai_provider) VALUES (?, ?, ?)').run('test-user-setting-1', testUserId, 'ollama');
  console.log('\n[Ollama Call Log Test]');
  await chatWithPaper(paper, 'Summarize the core premise in one sentence.', [], testUserId);

  // ----------------------------------------------------
  // TEST 3: NO CITATIONS ON "COULDN'T FIND ENOUGH INFO"
  // ----------------------------------------------------
  console.log('\n--- TEST 3: NO CITATIONS ON "COULDN\'T FIND ENOUGH INFORMATION" ---');
  db.prepare('INSERT OR REPLACE INTO user_settings (id, user_id, ai_provider) VALUES (?, ?, ?)').run('test-user-setting-1', testUserId, 'gemini');
  const unanswerableRes = await chatWithPaper(paper, 'What is the recipe for baking chocolate brownies according to this paper?', [], testUserId);
  console.log('Question: "What is the recipe for baking chocolate brownies according to this paper?"');
  console.log('Raw Answer:', unanswerableRes.text);
  console.log('Sources returned:', JSON.stringify(unanswerableRes.sources));
  console.log('Sources length is 0?:', unanswerableRes.sources?.length === 0);

  // ----------------------------------------------------
  // TEST 4: CLEAN CITATIONS ("Section, page N")
  // ----------------------------------------------------
  console.log('\n--- TEST 4: CLEAN CITATIONS FORMAT ---');
  const answerableRes = await chatWithPaper(paper, 'What methodology and retrieval techniques are used?', [], testUserId);
  console.log('Question: "What methodology and retrieval techniques are used?"');
  console.log('Raw Answer:', answerableRes.text);
  console.log('Sources returned:', JSON.stringify(answerableRes.sources));
  console.log('Are sources clean metadata (not raw chunk content)?:', answerableRes.sources?.every((s: string) => typeof s === 'string' && s.length < 100));

  // ----------------------------------------------------
  // TEST 5: PAGE QUESTIONS HANDLING
  // ----------------------------------------------------
  console.log('\n--- TEST 5: PAGE QUESTIONS HANDLING ---');
  const page1Res = await chatWithPaper(paper, 'What is introduced on the first page of this paper?', [], testUserId);
  console.log('Question: "What is introduced on the first page of this paper?"');
  console.log('Raw Answer:', page1Res.text);
  console.log('Sources returned:', JSON.stringify(page1Res.sources));

  // ----------------------------------------------------
  // TEST 6: RE-RUN SAME QUESTIONS ON BOTH PROVIDERS
  // ----------------------------------------------------
  console.log('\n--- TEST 6: RE-RUN SAME QUESTIONS ON BOTH PROVIDERS ---');
  const q1 = 'What methodology was used?';
  const q2 = 'What are the limitations?';

  // 1) Provider: Gemini
  db.prepare('INSERT OR REPLACE INTO user_settings (id, user_id, ai_provider) VALUES (?, ?, ?)').run('test-user-setting-1', testUserId, 'gemini');
  console.log('\n>>> PROVIDER: Google Gemini (gemini-flash-lite-latest)');
  console.log(`[Gemini Q1]: "${q1}"`);
  const geminiQ1 = await chatWithPaper(paper, q1, [], testUserId);
  console.log('Gemini Q1 Answer:\n', geminiQ1.text);
  console.log('Gemini Q1 Sources:', JSON.stringify(geminiQ1.sources));

  console.log(`\n[Gemini Q2]: "${q2}"`);
  const geminiQ2 = await chatWithPaper(paper, q2, [], testUserId);
  console.log('Gemini Q2 Answer:\n', geminiQ2.text);
  console.log('Gemini Q2 Sources:', JSON.stringify(geminiQ2.sources));

  // 2) Provider: Ollama
  db.prepare('INSERT OR REPLACE INTO user_settings (id, user_id, ai_provider) VALUES (?, ?, ?)').run('test-user-setting-1', testUserId, 'ollama');
  console.log('\n>>> PROVIDER: Local Ollama (qwen3:4b-instruct)');
  console.log(`[Ollama Q1]: "${q1}"`);
  const ollamaQ1 = await chatWithPaper(paper, q1, [], testUserId);
  console.log('Ollama Q1 Answer:\n', ollamaQ1.text);
  console.log('Ollama Q1 Sources:', JSON.stringify(ollamaQ1.sources));

  console.log(`\n[Ollama Q2]: "${q2}"`);
  const ollamaQ2 = await chatWithPaper(paper, q2, [], testUserId);
  console.log('Ollama Q2 Answer:\n', ollamaQ2.text);
  console.log('Ollama Q2 Sources:', JSON.stringify(ollamaQ2.sources));

  console.log('\n====================================================');
  console.log('   ALL TESTS COMPLETE                                ');
  console.log('====================================================');
}

runTests().catch(console.error);
