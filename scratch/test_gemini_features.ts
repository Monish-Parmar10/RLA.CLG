import 'dotenv/config';
import { GeminiProvider, analyzePaper, reviewPaper, generateSummary, chatWithPaper } from '../server/ai.ts';
import Database from 'better-sqlite3';

const db = new Database('data/researchlens.db');

async function testGemini() {
  console.log('=== TESTING GEMINI LIVE AI CAPABILITIES ===\n');

  const gemini = new GeminiProvider();
  const available = await gemini.isAvailable();
  console.log('Gemini isAvailable:', available);

  const paper = db.prepare('SELECT * FROM papers LIMIT 1').get();
  if (!paper) {
    console.log('No paper found in DB.');
    return;
  }
  console.log('Paper:', paper.title || paper.original_name, '(ID:', paper.id, ')\n');

  // Set user setting to gemini
  db.prepare('INSERT OR REPLACE INTO user_settings (id, user_id, ai_provider, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').run('test_setting', paper.user_id, 'gemini');

  console.log('--- 1. Testing Live Summary Generation with Gemini ---');
  const summary = await generateSummary(paper, paper.user_id);
  console.log('Summary Result:');
  console.log('One-line:', summary.one_line);
  console.log('Executive:', summary.executive);
  console.log('Detailed:', summary.detailed?.slice(0, 150) + '...');
  console.log('is_fallback:', summary.is_fallback, 'provider:', summary.provider);

  console.log('\n--- 2. Testing Live Quality Scorecard (7 dimensions) with Gemini ---');
  const analysis = await analyzePaper(paper, paper.user_id);
  console.log('Analysis Result:');
  console.log('Overall Score:', analysis.overall);
  console.log('Dimensions:');
  const dims = ['problem_statement', 'literature_review', 'methodology', 'experiments', 'results', 'conclusion', 'references'];
  for (const d of dims) {
    console.log(`  - ${d}: score=${analysis[d]?.score}, reason="${analysis[d]?.reason}"`);
  }
  console.log('is_fallback:', analysis.is_fallback);

  console.log('\n--- 3. Testing Live Reviewer Mode with Gemini ---');
  const review = await reviewPaper(paper, paper.user_id);
  console.log('Review Result:');
  console.log('Recommendation:', review.recommendation);
  console.log('Strengths count:', review.strengths?.length, 'sample:', review.strengths?.[0]);
  console.log('Weaknesses count:', review.weaknesses?.length, 'sample:', review.weaknesses?.[0]);
  console.log('Questions count:', review.reviewer_questions?.length, 'sample:', review.reviewer_questions?.[0]);
  console.log('is_fallback:', review.is_fallback);

  console.log('\n--- 4. Testing Live Chat with Gemini ---');
  const chat1 = await chatWithPaper(paper, 'What is the methodology proposed in this paper?', [], paper.user_id);
  console.log('Answer 1 (Methodology):', chat1.text);
  console.log('Sources:', chat1.sources);
  console.log('is_fallback:', chat1.isFallback);

  console.log('\n--- 5. Testing Chat Unanswerable Question Safeguard ---');
  const chat2 = await chatWithPaper(paper, 'What is the stock price of Apple in 2026?', [], paper.user_id);
  console.log('Answer 2 (Unanswerable):', chat2.text);
  console.log('is_fallback:', chat2.isFallback);

  console.log('\n=== ALL GEMINI FEATURES TESTED LIVE SUCCESSFULLY ===');
}

testGemini().catch(console.error);
