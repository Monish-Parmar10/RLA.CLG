import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';
import { requireAuth, optionalAuth, generateToken, AuthRequest } from './auth.js';
import { processPDF } from './pdf.js';
import {
  analyzePaper,
  chatWithPaper,
  reviewPaper,
  generateSummary,
  GeminiProvider,
  OllamaProvider,
} from './ai.js';
import { exportToDocx, exportToLatex, exportToMarkdown } from './export.js';

const app = express();
const port = process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3001);

app.use(cors());
app.use(express.json({ limit: '20mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted.'));
    }
  },
});

const uploadMiddleware = upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

function validatePassword(password: string, name?: string, email?: string): string | null {
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.';
  const lower = password.toLowerCase();
  const commonPasswords = [
    'password',
    '12345678',
    'qwerty123',
    'password1',
    'abc12345',
    '11111111',
    'iloveyou',
    'admin123',
    '1q2w3e4r',
    'sunshine',
  ];
  if (commonPasswords.includes(lower)) {
    return 'Password is too common. Please choose a more unique password.';
  }
  if (name && name.length >= 4 && lower.includes(name.toLowerCase().slice(0, 4))) {
    return 'Password must not contain your name.';
  }
  if (email && lower.includes(email.split('@')[0].toLowerCase().slice(0, 4))) {
    return 'Password must not contain your email.';
  }
  return null;
}


app.post('/api/auth/register', authLimiter, (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validationError = validatePassword(password, name, email);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
      id,
      email,
      hash,
      name
    );

    const token = generateToken({ id, email });
    const user = { id, email, name };
    res.json({ token, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  try {
    const { email, password } = req.body;
    const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken({ id: user.id, email: user.email });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
  try {
    const user = db
      .prepare('SELECT id, email, name FROM users WHERE id = ?')
      .get(req.user!.id) as any;
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, email: user.email, name: user.name, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/settings/ai', requireAuth, (req: AuthRequest, res) => {
  try {
    const setting: any = db
      .prepare('SELECT ai_provider FROM user_settings WHERE user_id = ?')
      .get(req.user!.id);
    res.json({ provider: setting?.ai_provider || 'gemini' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings/ai', requireAuth, (req: AuthRequest, res) => {
  try {
    const { provider } = req.body;
    if (provider !== 'gemini' && provider !== 'ollama') {
      return res.status(400).json({ error: 'Invalid provider. Must be "gemini" or "ollama".' });
    }
    const existing = db.prepare('SELECT id FROM user_settings WHERE user_id = ?').get(req.user!.id);
    if (existing) {
      db.prepare(
        'UPDATE user_settings SET ai_provider = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
      ).run(provider, req.user!.id);
    } else {
      db.prepare('INSERT INTO user_settings (id, user_id, ai_provider) VALUES (?, ?, ?)').run(
        uuidv4(),
        req.user!.id,
        provider
      );
    }
    res.json({ success: true, provider });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ai/status', async (_req, res) => {
  try {
    const gemini = new GeminiProvider();
    const ollama = new OllamaProvider();
    const geminiAvailable = await gemini.isAvailable();
    const ollamaAvailable = await ollama.isAvailable();

    res.json({
      gemini: {
        available: geminiAvailable,
        model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
        reason: geminiAvailable
          ? undefined
          : (process.env.GEMINI_API_KEY
              ? 'Invalid Gemini API key or access denied'
              : 'Missing GEMINI_API_KEY environment variable'),
      },
      ollama: {
        available: ollamaAvailable,
        model: process.env.OLLAMA_MODEL || 'qwen3:4b-instruct',
        reason: ollamaAvailable
          ? undefined
          : `Ollama server unreachable at ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'} or model "${process.env.OLLAMA_MODEL || 'qwen3:4b-instruct'}" not pulled`,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/papers/upload', requireAuth, (req, res, next) => {
  uploadMiddleware(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' });
      }
      return res.status(400).json({ error: err.message || 'Upload error.' });
    }
    next();
  });
}, async (req: AuthRequest, res) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]>;
    const file = files?.pdf?.[0] || files?.file?.[0];
    if (!file) return res.status(400).json({ error: 'No PDF file uploaded' });

    const buffer = fs.readFileSync(file.path);
    if (buffer.length < 4 || buffer.toString('ascii', 0, 4) !== '%PDF') {
      try {
        fs.unlinkSync(file.path);
      } catch {}
      return res.status(400).json({
        error: 'Invalid file format. File does not appear to be a valid PDF.',
      });
    }

    const paperId = uuidv4();
    const processed = await processPDF(file.path);

    if (!processed.content_text || processed.content_text.trim().length < 50) {
      try {
        fs.unlinkSync(file.path);
      } catch {}
      return res.status(400).json({
        error:
          'This PDF appears to contain scanned images rather than selectable text. OCR support is required to analyze it.',
      });
    }

    db.prepare(`
      INSERT INTO papers (id, user_id, filename, original_name, title, authors, abstract, content_text, sections, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paperId,
      req.user!.id,
      file.filename,
      file.originalname,
      processed.title,
      processed.authors,
      processed.abstract,
      processed.content_text,
      JSON.stringify(processed.sections),
      JSON.stringify({})
    );

    const insertChunk = db.prepare(
      'INSERT INTO paper_chunks (id, paper_id, chunk_index, content, section_name) VALUES (?, ?, ?, ?, ?)'
    );
    const tx = db.transaction((chunks: any[]) => {
      for (const chunk of chunks) {
        insertChunk.run(uuidv4(), paperId, chunk.chunk_index, chunk.content, chunk.section_name);
      }
    });
    tx(processed.chunks);

    const savedPaper: any = db.prepare('SELECT * FROM papers WHERE id = ?').get(paperId);
    res.json({
      ...savedPaper,
      sections: processed.sections,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to process PDF' });
  }
});

app.get('/api/papers', requireAuth, (req: AuthRequest, res) => {
  try {
    const papers: any[] = db
      .prepare('SELECT * FROM papers WHERE user_id = ? ORDER BY upload_date DESC')
      .all(req.user!.id);
    const parsed = papers.map((p) => ({
      ...p,
      sections: JSON.parse(p.sections || '[]'),
    }));
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/papers/:id', requireAuth, (req: AuthRequest, res) => {
  try {
    const paper: any = db
      .prepare('SELECT * FROM papers WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });
    res.json({
      ...paper,
      sections: JSON.parse(paper.sections || '[]'),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/papers/:id', requireAuth, (req: AuthRequest, res) => {
  try {
    db.prepare('DELETE FROM papers WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
    db.prepare('DELETE FROM paper_chunks WHERE paper_id = ?').run(req.params.id);
    db.prepare('DELETE FROM chat_messages WHERE paper_id = ?').run(req.params.id);
    db.prepare('DELETE FROM summaries WHERE paper_id = ?').run(req.params.id);
    db.prepare('DELETE FROM reviews WHERE paper_id = ?').run(req.params.id);
    db.prepare('DELETE FROM analysis_scores WHERE paper_id = ?').run(req.params.id);
    db.prepare('DELETE FROM ai_cache WHERE paper_id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/papers/:id/summary', requireAuth, async (req: AuthRequest, res) => {
  try {
    const paper: any = db
      .prepare('SELECT * FROM papers WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const summary = await generateSummary(paper, req.user!.id);
    const summaryId = uuidv4();

    db.prepare(`
      INSERT INTO summaries (id, paper_id, user_id, provider, one_line, executive, detailed, sections, is_fallback)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      summaryId,
      req.params.id,
      req.user!.id,
      summary.provider || 'default',
      summary.one_line,
      summary.executive,
      summary.detailed,
      JSON.stringify(summary.sections || {}),
      summary.is_fallback ? 1 : 0
    );

    res.json({
      id: summaryId,
      paper_id: req.params.id,
      ...summary,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/papers/:id/summary', requireAuth, (req: AuthRequest, res) => {
  try {
    const summary: any = db
      .prepare(
        'SELECT * FROM summaries WHERE paper_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(req.params.id, req.user!.id);
    if (!summary) return res.json(null);
    res.json({
      ...summary,
      sections: JSON.parse(summary.sections || '{}'),
      is_fallback: Boolean(summary.is_fallback),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/papers/:id/analyze', requireAuth, async (req: AuthRequest, res) => {
  try {
    const paper: any = db
      .prepare('SELECT * FROM papers WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const analysis = await analyzePaper(paper, req.user!.id);
    const id = uuidv4();

    const reasons = {
      problem_statement:
        analysis.problem_statement?.reason || 'Clear problem scoping and gap definition.',
      literature_review:
        analysis.literature_review?.reason || 'Literature baseline coverage.',
      methodology: analysis.methodology?.reason || 'Methodological pipeline description.',
      experiments: analysis.experiments?.reason || 'Experimental protocol.',
      results: analysis.results?.reason || 'Results reporting.',
      conclusion: analysis.conclusion?.reason || 'Conclusion takeaway.',
      references: analysis.references?.reason || 'Reference formatting.',
    };

    db.prepare(`
      INSERT INTO analysis_scores (id, paper_id, user_id, overall, methodology, results, writing, "references", novelty, reproducibility, problem_statement, literature_review, experiments, conclusion, strengths, weaknesses, recommendations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.params.id,
      req.user!.id,
      analysis.overall || 80,
      analysis.methodology?.score ?? 80,
      analysis.results?.score ?? 80,
      analysis.writing || 80,
      analysis.references?.score ?? 80,
      analysis.novelty || 80,
      analysis.reproducibility || 80,
      analysis.problem_statement?.score ?? 80,
      analysis.literature_review?.score ?? 80,
      analysis.experiments?.score ?? 80,
      analysis.conclusion?.score ?? 80,
      JSON.stringify(analysis.strengths || []),
      JSON.stringify(analysis.weaknesses || []),
      JSON.stringify(analysis.recommendations || [])
    );

    res.json({
      id,
      paper_id: req.params.id,
      overall: analysis.overall || 80,
      problem_statement: analysis.problem_statement?.score ?? 80,
      literature_review: analysis.literature_review?.score ?? 80,
      methodology: analysis.methodology?.score ?? 80,
      experiments: analysis.experiments?.score ?? 80,
      results: analysis.results?.score ?? 80,
      conclusion: analysis.conclusion?.score ?? 80,
      references: analysis.references?.score ?? 80,
      reasons,
      strengths: analysis.strengths || [],
      weaknesses: analysis.weaknesses || [],
      recommendations: analysis.recommendations || [],
      is_fallback: Boolean(analysis.isFallback),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/papers/:id/analysis', requireAuth, (req: AuthRequest, res) => {
  try {
    const analysis: any = db
      .prepare(
        'SELECT * FROM analysis_scores WHERE paper_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(req.params.id, req.user!.id);
    if (!analysis) return res.json(null);

    res.json({
      id: analysis.id,
      paper_id: analysis.paper_id,
      overall: analysis.overall || 80,
      problem_statement: analysis.problem_statement ?? 80,
      literature_review: analysis.literature_review ?? 80,
      methodology: analysis.methodology ?? 80,
      experiments: analysis.experiments ?? 80,
      results: analysis.results ?? 80,
      conclusion: analysis.conclusion ?? 80,
      references: analysis.references ?? 80,
      reasons: {
        problem_statement: 'Evidence based on paper problem framing.',
        literature_review: 'Literature baseline alignment.',
        methodology: 'Clarity of the implementation pipeline.',
        experiments: 'Experimental depth and ablation.',
        results: 'Validation metrics reported.',
        conclusion: 'Synthesis of contributions.',
        references: 'IEEE citation format check.',
      },
      strengths: JSON.parse(analysis.strengths || '[]'),
      weaknesses: JSON.parse(analysis.weaknesses || '[]'),
      recommendations: JSON.parse(analysis.recommendations || '[]'),
      is_fallback: false,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/papers/:id/review', requireAuth, async (req: AuthRequest, res) => {
  try {
    const paper: any = db
      .prepare('SELECT * FROM papers WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const review = await reviewPaper(paper, req.user!.id);
    const id = uuidv4();

    db.prepare(`
      INSERT INTO reviews (id, paper_id, user_id, reviewer_name, verdict, confidence, comments)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.params.id,
      req.user!.id,
      'Peer Reviewer',
      review.recommendation || 'Borderline',
      85,
      JSON.stringify({
        reviewer_analysis: review.reviewer_analysis || '',
        strengths: review.strengths || [],
        weaknesses: review.weaknesses || [],
        reviewer_questions: review.reviewer_questions || [],
      })
    );

    res.json([
      {
        id,
        paper_id: req.params.id,
        reviewer_analysis: review.reviewer_analysis || '',
        strengths: review.strengths || [],
        weaknesses: review.weaknesses || [],
        reviewer_questions: review.reviewer_questions || [],
        recommendation: review.recommendation || 'Borderline',
        is_fallback: Boolean(review.isFallback),
      },
    ]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/papers/:id/reviews', requireAuth, (req: AuthRequest, res) => {
  try {
    const reviews: any[] = db
      .prepare('SELECT * FROM reviews WHERE paper_id = ? AND user_id = ? ORDER BY created_at DESC')
      .all(req.params.id, req.user!.id);
    const parsed = reviews.map((r) => {
      let commentData = {};
      try {
        commentData = JSON.parse(r.comments || '{}');
      } catch {}
      return {
        id: r.id,
        paper_id: r.paper_id,
        reviewer_name: r.reviewer_name,
        verdict: r.verdict,
        confidence: r.confidence,
        recommendation: r.verdict,
        ...commentData,
      };
    });
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/papers/:id/chat', requireAuth, async (req: AuthRequest, res) => {
  try {
    const paper: any = db
      .prepare('SELECT * FROM papers WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const message = req.body.message || req.body.content;
    if (!message) return res.status(400).json({ error: 'Message cannot be empty' });

    db.prepare(
      'INSERT INTO chat_messages (id, paper_id, user_id, role, content) VALUES (?, ?, ?, ?, ?)'
    ).run(uuidv4(), req.params.id, req.user!.id, 'user', message);

    const history = db
      .prepare(
        'SELECT * FROM chat_messages WHERE paper_id = ? AND user_id = ? ORDER BY created_at ASC'
      )
      .all(req.params.id, req.user!.id);

    const reply = await chatWithPaper(paper, message, history, req.user!.id);
    const replyId = uuidv4();
    db.prepare(
      'INSERT INTO chat_messages (id, paper_id, user_id, role, content, sources) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      replyId,
      req.params.id,
      req.user!.id,
      'assistant',
      reply.text,
      JSON.stringify(reply.sources || [])
    );

    res.json({
      id: replyId,
      role: 'assistant',
      text: reply.text,
      content: reply.text,
      sources: reply.sources,
      is_fallback: reply.isFallback,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/papers/:id/chat', requireAuth, (req: AuthRequest, res) => {
  try {
    const messages: any[] = db
      .prepare(
        'SELECT * FROM chat_messages WHERE paper_id = ? AND user_id = ? ORDER BY created_at ASC'
      )
      .all(req.params.id, req.user!.id);
    const parsed = messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.content,
      sources: JSON.parse(m.sources || '[]'),
    }));
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/drafts', requireAuth, (req: AuthRequest, res) => {
  try {
    const drafts: any[] = db
      .prepare('SELECT * FROM builder_drafts WHERE user_id = ? ORDER BY updated_at DESC')
      .all(req.user!.id);
    const parsed = drafts.map((d) => ({
      ...d,
      sections: JSON.parse(d.sections || '[]'),
    }));
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/drafts', requireAuth, (req: AuthRequest, res) => {
  try {
    const { paper_id, title, authors, abstract, keywords, sections, source_data, format_applied } =
      req.body;
    const id = uuidv4();
    db.prepare(`
      INSERT INTO builder_drafts (id, user_id, paper_id, title, authors, abstract, keywords, sections, source_data, format_applied)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.user!.id,
      paper_id || null,
      title || 'Untitled Research Draft',
      authors || '',
      abstract || '',
      keywords || '',
      JSON.stringify(sections || []),
      source_data || '',
      format_applied ? 1 : 0
    );

    const draft: any = db.prepare('SELECT * FROM builder_drafts WHERE id = ?').get(id);
    res.json({
      ...draft,
      sections: JSON.parse(draft.sections || '[]'),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/drafts/:id', requireAuth, (req: AuthRequest, res) => {
  try {
    const draft: any = db
      .prepare('SELECT * FROM builder_drafts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    res.json({
      ...draft,
      sections: JSON.parse(draft.sections || '[]'),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/drafts/:id', requireAuth, (req: AuthRequest, res) => {
  try {
    const { title, authors, abstract, keywords, sections, source_data, format_applied } = req.body;
    db.prepare(`
      UPDATE builder_drafts
      SET title = COALESCE(?, title),
          authors = COALESCE(?, authors),
          abstract = COALESCE(?, abstract),
          keywords = COALESCE(?, keywords),
          sections = CASE WHEN ? IS NOT NULL THEN ? ELSE sections END,
          source_data = COALESCE(?, source_data),
          format_applied = COALESCE(?, format_applied),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      title,
      authors,
      abstract,
      keywords,
      sections ? 1 : null,
      sections ? JSON.stringify(sections) : null,
      source_data,
      format_applied ? 1 : 0,
      req.params.id,
      req.user!.id
    );

    const updated: any = db.prepare('SELECT * FROM builder_drafts WHERE id = ?').get(req.params.id);
    res.json({
      ...updated,
      sections: JSON.parse(updated.sections || '[]'),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/drafts/:id/export', requireAuth, async (req: AuthRequest, res) => {
  try {
    const draft: any = db
      .prepare('SELECT * FROM builder_drafts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    const { format } = req.body;
    const safeTitle = (draft.title || 'Paper').replace(/[^a-zA-Z0-9_-]/g, '_');

    if (format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.md"`);
      return res.send(exportToMarkdown(draft));
    } else if (format === 'latex') {
      res.setHeader('Content-Type', 'application/x-latex; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.tex"`);
      return res.send(exportToLatex(draft));
    } else if (format === 'docx') {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.docx"`);
      const buffer = await exportToDocx(draft);
      return res.send(buffer);
    } else {
      return res
        .status(400)
        .json({ error: 'Invalid export format. Choose latex, docx, or markdown.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/guide/:projectId', requireAuth, (req: AuthRequest, res) => {
  try {
    const answers = db
      .prepare(
        'SELECT step_index, answer FROM guide_answers WHERE project_id = ? AND user_id = ? ORDER BY step_index ASC'
      )
      .all(req.params.projectId, req.user!.id);
    res.json(answers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/guide/:projectId/:stepIndex', requireAuth, (req: AuthRequest, res) => {
  try {
    const { answer } = req.body;
    const stepIndex = parseInt(req.params.stepIndex, 10);
    const projectId = req.params.projectId;

    try {
      db.prepare('INSERT OR IGNORE INTO projects (id, user_id, name) VALUES (?, ?, ?)').run(
        projectId,
        req.user!.id,
        'Default Project'
      );
    } catch {}

    const existing = db
      .prepare(
        'SELECT id FROM guide_answers WHERE project_id = ? AND user_id = ? AND step_index = ?'
      )
      .get(projectId, req.user!.id, stepIndex);

    if (existing) {
      db.prepare(
        'UPDATE guide_answers SET answer = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(answer, (existing as any).id);
    } else {
      db.prepare(
        'INSERT INTO guide_answers (id, project_id, user_id, step_index, answer) VALUES (?, ?, ?, ?, ?)'
      ).run(uuidv4(), projectId, req.user!.id, stepIndex, answer);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


const distPath = path.join(process.cwd(), 'dist', 'public');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`ResearchLens Backend server running on http://localhost:${port}`);
});
