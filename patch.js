const fs = require('fs');
const path = require('path');

const indexTsPath = path.join(__dirname, 'server', 'index.ts');
let indexCode = fs.readFileSync(indexTsPath, 'utf-8');

// 1. Add express-rate-limit and validatePassword function
if (!indexCode.includes("import rateLimit from 'express-rate-limit';")) {
  indexCode = indexCode.replace(
    "import express from 'express';",
    "import express from 'express';\nimport rateLimit from 'express-rate-limit';"
  );
}

if (!indexCode.includes('function validatePassword')) {
  const vpStr = `
function validatePassword(password: string, name: string, email: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.';
  const lower = password.toLowerCase();
  const commonPasswords = ['password', '12345678', 'qwerty123', 'password1', 'abc12345', '11111111', 'iloveyou', 'admin123', '1q2w3e4r', 'sunshine'];
  if (commonPasswords.includes(lower)) return 'Password is too common. Please choose a more unique password.';
  if (name && lower.includes(name.toLowerCase().slice(0, 4))) return 'Password must not contain your name.';
  if (email && lower.includes(email.split('@')[0].toLowerCase().slice(0, 4))) return 'Password must not contain your email.';
  return null;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
`;
  indexCode = indexCode.replace('// ─── Auth Routes ─────────────────────────────────────────────────────────────', '// ─── Auth Routes ─────────────────────────────────────────────────────────────\n' + vpStr);
}

// Update /api/auth/register and /api/auth/login
indexCode = indexCode.replace("app.post('/api/auth/register', (req, res) => {", "app.post('/api/auth/register', authLimiter, (req, res) => {");
indexCode = indexCode.replace("app.post('/api/auth/login', (req, res) => {", "app.post('/api/auth/login', authLimiter, (req, res) => {");

// Add validation to register
const registerStr = `
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const valErr = validatePassword(password, name, email);
    if (valErr) {
      return res.status(400).json({ error: valErr });
    }
`;
indexCode = indexCode.replace(
    /const { email, password, name } = req\.body;\s+if \(!email \|\| !password \|\| !name\) \{\s+return res\.status\(400\)\.json\(\{ error: 'Missing required fields' \}\);\s+\}/,
    registerStr
);

// 2. Upload security
const uploadLimiter = `
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted.'));
    }
  }
`;
indexCode = indexCode.replace(
  "const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });",
  "const upload = multer({ storage, " + uploadLimiter + " });"
);

const beforeProcess = `
    if (file.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' });
    if (file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Invalid file type. Only PDF files are accepted.' });
    
    const buffer = fs.readFileSync(file.path);
    if (buffer.length < 4 || buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
      return res.status(400).json({ error: 'Invalid file format. File does not appear to be a valid PDF.' });
    }

    const processed = await processPDF(file.path);
    if (!processed.content_text || processed.content_text.trim().length < 50) {
      return res.status(400).json({ error: 'This PDF appears to contain scanned images rather than selectable text. OCR support is required to analyze it.' });
    }
`;
indexCode = indexCode.replace(
    /const processed = await processPDF\(file\.path\);/,
    beforeProcess
);

// 3. New endpoints & update AI routes
if (!indexCode.includes('import { generateSummary, getProvider }')) {
  indexCode = indexCode.replace(
    "import { analyzePaper, chatWithPaper, reviewPaper } from './ai.js';",
    "import { analyzePaper, chatWithPaper, reviewPaper, generateSummary, getProvider } from './ai.js';"
  );
}

const aiRoutesStr = `
// ─── New AI Setting Routes ──────────────────────────────────────────────────
app.get('/api/settings/ai', requireAuth, (req, res) => {
  try {
    const setting = db.prepare('SELECT ai_provider FROM user_settings WHERE user_id = ?').get(req.user.id);
    res.json({ provider: setting?.ai_provider || 'gemini' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings/ai', requireAuth, (req, res) => {
  try {
    const { provider } = req.body;
    db.prepare('INSERT INTO user_settings (id, user_id, ai_provider) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET ai_provider = ?, updated_at = CURRENT_TIMESTAMP')
      .run(require('uuid').v4(), req.user.id, provider, provider);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ai/status', async (req, res) => {
  try {
    const geminiAvailable = !!process.env.GEMINI_API_KEY;
    
    let ollamaAvailable = false;
    let ollamaReason;
    try {
      const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const ores = await fetch(\`\${baseUrl}/api/tags\`);
      if (ores.ok) ollamaAvailable = true;
      else ollamaReason = \`\${ores.status}\`;
    } catch (e) {
      ollamaReason = e.message;
    }
    
    res.json({
      gemini: { available: geminiAvailable, reason: geminiAvailable ? undefined : 'No API key' },
      ollama: { available: ollamaAvailable, model: process.env.OLLAMA_MODEL || 'qwen3:4b', reason: ollamaReason }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/papers/:id/summary', requireAuth, async (req, res) => {
  try {
    const paper = db.prepare('SELECT * FROM papers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });
    
    const summary = await generateSummary(paper, req.user.id);
    const id = require('uuid').v4();
    db.prepare(\`
      INSERT INTO summaries (id, paper_id, user_id, provider, one_line, executive, detailed, sections, is_fallback)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    \`).run(id, req.params.id, req.user.id, summary.provider || 'unknown', summary.one_line, summary.executive, summary.detailed, JSON.stringify(summary.sections), summary.isFallback ? 1 : 0);
    
    res.json({
      id,
      paper_id: req.params.id,
      ...summary
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/papers/:id/summary', requireAuth, (req, res) => {
  try {
    const summary = db.prepare('SELECT * FROM summaries WHERE paper_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1').get(req.params.id, req.user.id);
    if (!summary) return res.json(null);
    res.json({
      ...summary,
      sections: JSON.parse(summary.sections || '{}'),
      is_fallback: !!summary.is_fallback
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
`;

if (!indexCode.includes('/api/settings/ai')) {
  indexCode = indexCode.replace('// ─── Analysis & AI Routes ────────────────────────────────────────────────────', '// ─── Analysis & AI Routes ────────────────────────────────────────────────────\n' + aiRoutesStr);
}

// Update /api/papers/:id/analyze
const analyzeOrig = /const analysis = await analyzePaper\(paper\);[\s\S]*?id,\s*req\.params\.id,\s*req\.user!\.id,[\s\S]*?\n    \);[\s\S]*?res\.json\(\{[\s\S]*?\}\);/m;
const analyzeNew = `
    const analysis = await analyzePaper(paper, req.user.id);
    const id = require('uuid').v4();
    db.prepare(\`
      INSERT INTO analysis_scores (id, paper_id, user_id, overall, problem_statement, literature_review, methodology, experiments, results, conclusion, "references", strengths, weaknesses, recommendations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    \`).run(
      id,
      req.params.id,
      req.user.id,
      analysis.overall,
      analysis.problem_statement?.score || 0,
      analysis.literature_review?.score || 0,
      analysis.methodology?.score || 0,
      analysis.experiments?.score || 0,
      analysis.results?.score || 0,
      analysis.conclusion?.score || 0,
      analysis.references?.score || 0,
      '[]', // strengths
      '[]', // weaknesses
      '[]'  // recommendations
    );

    res.json({
      id,
      paper_id: req.params.id,
      overall: analysis.overall,
      problem_statement: analysis.problem_statement?.score || 0,
      literature_review: analysis.literature_review?.score || 0,
      methodology: analysis.methodology?.score || 0,
      experiments: analysis.experiments?.score || 0,
      results: analysis.results?.score || 0,
      conclusion: analysis.conclusion?.score || 0,
      references: analysis.references?.score || 0,
      reasons: {
        problem_statement: analysis.problem_statement?.reason || '',
        literature_review: analysis.literature_review?.reason || '',
        methodology: analysis.methodology?.reason || '',
        experiments: analysis.experiments?.reason || '',
        results: analysis.results?.reason || '',
        conclusion: analysis.conclusion?.reason || '',
        references: analysis.references?.reason || '',
      },
      strengths: [],
      weaknesses: [],
      recommendations: [],
      provider: analysis.provider || 'unknown',
      is_fallback: !!analysis.isFallback
    });
`;
indexCode = indexCode.replace(analyzeOrig, analyzeNew.trim());

// Update /api/papers/:id/review
const reviewOrig = /const reviews = await reviewPaper\(paper\);[\s\S]*?res\.json\(savedReviews\);/m;
const reviewNew = `
    const r = await reviewPaper(paper, req.user.id);
    const id = require('uuid').v4();
    db.prepare(\`
      INSERT INTO reviews (id, paper_id, user_id, reviewer_name, verdict, confidence, comments)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    \`).run(id, req.params.id, req.user.id, 'AI Reviewer', r.recommendation, 100, JSON.stringify(r));

    res.json([{
      id,
      paper_id: req.params.id,
      reviewer_analysis: r.reviewer_analysis,
      strengths: r.strengths,
      weaknesses: r.weaknesses,
      reviewer_questions: r.reviewer_questions,
      recommendation: r.recommendation,
      is_fallback: !!r.isFallback
    }]);
`;
indexCode = indexCode.replace(reviewOrig, reviewNew.trim());

// Update chat route
const chatOrig = /const reply = await chatWithPaper\(paper, message, history\);/g;
indexCode = indexCode.replace(chatOrig, "const reply = await chatWithPaper(paper, message, history, req.user.id);");

fs.writeFileSync(indexTsPath, indexCode, 'utf-8');

// Also API updates
const apiPath = path.join(__dirname, 'client', 'src', 'lib', 'api.ts');
let apiCode = fs.readFileSync(apiPath, 'utf-8');

const clientApiStr = \`
// AI Settings
export async function getAiProvider(): Promise<{ provider: 'gemini' | 'ollama' }> {
  return apiJson<{ provider: 'gemini' | 'ollama' }>('/settings/ai');
}

export async function setAiProvider(provider: 'gemini' | 'ollama'): Promise<void> {
  await apiJson('/settings/ai', { method: 'PUT', body: JSON.stringify({ provider }) });
}

export async function getAiStatus(): Promise<{ gemini: { available: boolean; reason?: string }; ollama: { available: boolean; model?: string; reason?: string } }> {
  return apiJson('/ai/status');
}

// Summary
export interface PaperSummary {
  id: string;
  paper_id: string;
  one_line: string;
  executive: string;
  detailed: string;
  sections: Record<string, string>;
  is_fallback: boolean;
  provider: string;
}

export async function generateSummary(paperId: string): Promise<PaperSummary> {
  return apiJson<PaperSummary>(\`/papers/\${paperId}/summary\`, { method: 'POST' });
}

export async function getSummary(paperId: string): Promise<PaperSummary | null> {
  try {
    return await apiJson<PaperSummary>(\`/papers/\${paperId}/summary\`);
  } catch {
    return null;
  }
}

// Updated AnalysisScore interface
export interface AnalysisScore {
  id: string;
  paper_id: string;
  overall: number;
  problem_statement: number;
  literature_review: number;
  methodology: number;
  experiments: number;
  results: number;
  conclusion: number;
  references: number;
  reasons: Record<string, string>;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  provider: string;
  is_fallback: boolean;
}

// Updated Review interface
export interface Review {
  id: string;
  paper_id: string;
  reviewer_analysis: string;
  strengths: string[];
  weaknesses: string[];
  reviewer_questions: string[];
  recommendation: 'Accept' | 'Weak Accept' | 'Borderline' | 'Weak Reject' | 'Reject';
  provider: string;
  is_fallback: boolean;
}
\`;

if (!apiCode.includes('getAiProvider')) {
  apiCode += '\\n' + clientApiStr;
  fs.writeFileSync(apiPath, apiCode, 'utf-8');
}
