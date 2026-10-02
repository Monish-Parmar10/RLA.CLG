import { db } from './db.js';
import crypto from 'crypto';

export interface AIProvider {
  name: string;
  generate(prompt: string, systemPrompt?: string, maxTokens?: number): Promise<string>;
  isAvailable(): Promise<boolean>;
}

export class GeminiProvider implements AIProvider {
  name = 'gemini';

  async isAvailable(): Promise<boolean> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return false;
    return key.length > 10;
  }

  async generate(prompt: string, systemPrompt?: string, maxTokens?: number): Promise<string> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('Missing Gemini API key');
    
    const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    
    const parts = [];
    if (systemPrompt) {
      parts.push({ text: `System: ${systemPrompt}` });
    }
    parts.push({ text: prompt });
    
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: maxTokens ? { maxOutputTokens: maxTokens } : undefined,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 400 && errText.includes('API_KEY_INVALID')) {
        throw new Error('Invalid Gemini API key');
      }
      if (res.status === 403) {
        throw new Error('Gemini API access denied (403 PERMISSION_DENIED: check Google AI Studio project access)');
      }
      if (res.status === 429) {
        throw new Error('Gemini rate limit exceeded / quota exhausted');
      }
      throw new Error(`Gemini error: ${res.status} ${res.statusText}`);
    }

    const data: any = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return stripThinkBlocks(text);
  }
}

export class OllamaProvider implements AIProvider {
  name = 'ollama';

  async isAvailable(): Promise<boolean> {
    try {
      const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const model = process.env.OLLAMA_MODEL || 'qwen3:4b-instruct';
      const res = await fetch(`${baseUrl}/api/tags`);
      if (!res.ok) return false;
      const data: any = await res.json();
      return data.models?.some((m: any) => m.name === model || m.name.startsWith(model + ':') || model.startsWith(m.name));
    } catch {
      return false;
    }
  }

  async generate(prompt: string, systemPrompt?: string, maxTokens?: number): Promise<string> {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'qwen3:4b-instruct';
    
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const options: Record<string, any> = { num_ctx: 4096 };
    if (maxTokens) {
      options.num_predict = maxTokens;
    }

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        think: false,
        options,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
    }

    const data: any = await res.json();
    return stripThinkBlocks(data.message?.content || '');
  }
}

export function stripThinkBlocks(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (cleaned.includes('</think>')) {
    cleaned = cleaned.split('</think>').pop()?.trim() || '';
  }
  return cleaned;
}

export function getProvider(userId: string): AIProvider | null {
  try {
    const setting = db.prepare('SELECT ai_provider FROM user_settings WHERE user_id = ?').get(userId) as any;
    const pref = setting?.ai_provider || 'gemini';
    const gemini = new GeminiProvider();
    const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10);
    if (pref === 'gemini' && hasGemini) return gemini;
    if (pref === 'ollama') return new OllamaProvider();
    if (hasGemini) return gemini;
    return new OllamaProvider();
  } catch {
    const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10);
    if (hasGemini) return new GeminiProvider();
    return new OllamaProvider();
  }
}

export function buildCompactContext(chunks: Array<{section_name: string; content: string; chunk_index: number; page_number?: number}>): string {
  return chunks.map(c => {
    const pageLabel = c.page_number ? `, page ${c.page_number}` : '';
    return `[${c.section_name || 'Context'}${pageLabel}]\n${c.content}\n\n`;
  }).join('');
}

export function selectSectionChunks(chunks: any[], sectionNames: string[], topK: number) {
  const matched = chunks.filter(c => sectionNames.some(s => new RegExp(s, 'i').test(c.section_name || '')));
  return matched.slice(0, topK);
}

function extractJSON(text: string): any {
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  
  try { return JSON.parse(cleaned); } catch {}
  
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
    try { return JSON.parse(jsonStr); } catch {}
  }
  
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const jsonStr = cleaned.substring(firstBracket, lastBracket + 1);
    try { return JSON.parse(jsonStr); } catch {}
  }
  
  throw new Error('Could not extract valid JSON from LLM output');
}

function getContentHash(text: string): string {
  return crypto.createHash('sha256').update(text.slice(0, 5000)).digest('hex');
}

function getCached(paperId: string, provider: string, contentHash: string, feature: string) {
  return db.prepare('SELECT result FROM ai_cache WHERE paper_id = ? AND provider = ? AND content_hash = ? AND feature = ?')
    .get(paperId, provider, contentHash, feature) as any;
}

function setCached(paperId: string, provider: string, contentHash: string, feature: string, result: string) {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO ai_cache (id, paper_id, provider, content_hash, feature, result) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, paperId, provider, contentHash, feature, result);
}

function modelForProvider(providerName: string): string {
  if (providerName === 'gemini') return process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  if (providerName === 'ollama') return process.env.OLLAMA_MODEL || 'qwen3:4b-instruct';
  return 'unknown';
}

function logTokenUsage(feature: string, providerName: string, promptLength: number, model: string) {
  const estimatedTokens = Math.ceil(promptLength / 4);
  console.log(`[AI] feature=${feature} provider=${providerName} approx_input_tokens=${estimatedTokens} model=${model}`);
}

export async function chatWithPaper(paper: any, message: string, history: any[], userId: string) {
  const provider = getProvider(userId);
  if (!provider) return { text: 'AI provider unavailable: showing fallback analysis.', isFallback: true, sources: [] };
  
  const isAvail = await provider.isAvailable();
  if (!isAvail) return { text: 'AI provider unavailable: showing fallback analysis.', isFallback: true, sources: [] };

  const allChunks = db.prepare('SELECT chunk_index, content, section_name, page_number FROM paper_chunks WHERE paper_id = ? ORDER BY chunk_index ASC').all(paper.id) as any[];
  
  let selectedChunks: any[] = [];

  const pageMatch = message.match(/\b(?:page\s*(\d+)|(first|1st|second|2nd|third|3rd)\s*page)\b/i);
  if (pageMatch) {
    let targetPage = 1;
    if (pageMatch[1]) {
      targetPage = parseInt(pageMatch[1], 10);
    } else if (pageMatch[2]) {
      const ord = pageMatch[2].toLowerCase();
      if (ord === 'first' || ord === '1st') targetPage = 1;
      else if (ord === 'second' || ord === '2nd') targetPage = 2;
      else if (ord === 'third' || ord === '3rd') targetPage = 3;
    }

    const chunksWithPage = allChunks.filter(c => c.page_number === targetPage);
    if (chunksWithPage.length > 0) {
      selectedChunks = chunksWithPage.slice(0, 5);
    } else if (targetPage === 1) {
      selectedChunks = allChunks.slice(0, 4);
    }
  }

  if (selectedChunks.length === 0) {
    const queryTerms = message.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length > 2);
    const scoredChunks = allChunks.map((chunk) => {
      let score = 0;
      const lowerContent = chunk.content.toLowerCase();
      for (const term of queryTerms) {
        if (lowerContent.includes(term)) score += 1;
        if (chunk.section_name && chunk.section_name.toLowerCase().includes(term)) score += 2;
      }
      return { ...chunk, score };
    });

    scoredChunks.sort((a, b) => b.score - a.score);
    selectedChunks = scoredChunks.slice(0, 5);
  }

  const context = buildCompactContext(selectedChunks);

  const rawSources = selectedChunks.map(c => {
    const sec = c.section_name || 'General';
    return c.page_number ? `${sec}, page ${c.page_number}` : sec;
  });
  const uniqueSources = Array.from(new Set(rawSources));

  const sysPrompt = 'Answer ONLY from the context provided. If the answer is not in the context, reply exactly: "I couldn\'t find enough information about this in the uploaded paper.". Never invent information. Cite section name when relevant.';
  
  const recentHistory = history.slice(-8);
  const histStr = recentHistory.map(h => `${h.role}: ${h.content}`).join('\n');
  const fullPrompt = `Context:\n${context}\n\nHistory:\n${histStr}\n\nUser Question: ${message}`;
  
  const currentModel = modelForProvider(provider.name);

  try {
    const text = await provider.generate(fullPrompt, sysPrompt, 512);
    logTokenUsage('chat', provider.name, fullPrompt.length + sysPrompt.length, currentModel);

    const notFoundRegex = /(couldn't find enough information|could not find enough information|not enough information|not mentioned in the (uploaded )?paper|cannot be found in the provided)/i;
    const isNotFound = notFoundRegex.test(text);
    const sources = isNotFound ? [] : uniqueSources;

    return { text, role: 'assistant', sources, isFallback: false };
  } catch (err) {
    return { text: 'AI provider unavailable: showing fallback analysis.', isFallback: true, sources: [] };
  }
}

export async function analyzePaper(paper: any, userId: string) {
  const provider = getProvider(userId);
  const isAvail = provider ? await provider.isAvailable() : false;
  
  const text = paper.content_text || '';
  const hash = getContentHash(text);
  const currentModel = provider ? modelForProvider(provider.name) : 'default';
  
  if (provider && isAvail) {
    try {
      const cached = getCached(paper.id, provider.name, hash, 'analyze');
      if (cached) return { ...JSON.parse(cached.result), isFallback: false };
    } catch {}
    
    const chunks = db.prepare('SELECT chunk_index, content, section_name, page_number FROM paper_chunks WHERE paper_id = ?').all(paper.id) as any[];
    const sections = ['Abstract', 'Introduction', 'Methodology', 'Results', 'Conclusion', 'References'];
    let contextChunks: any[] = [];
    for (const sec of sections) {
      contextChunks.push(...selectSectionChunks(chunks, [sec], 1));
    }
    contextChunks = contextChunks.slice(0, 6);
    const context = buildCompactContext(contextChunks);
    
    const sysPrompt = 'You are an academic paper quality assessor. Score exactly 7 dimensions. Return ONLY valid JSON, no markdown.';
    const prompt = `Context:\n${context}\n\nReturn JSON with exactly these 7 dimensions: problem_statement, literature_review, methodology, experiments, results, conclusion, references. Each: { "score": integer 0-100, "reason": "string (1-2 sentences based on evidence in the paper)" }`;
    
    for (let i = 0; i < 2; i++) {
      try {
        let resultText = await provider.generate(prompt, sysPrompt, 1024);
        logTokenUsage('analyze', provider.name, prompt.length + sysPrompt.length, currentModel);
        const parsed = extractJSON(resultText);
        
        let sum = 0;
        let count = 0;
        const dims = ['problem_statement', 'literature_review', 'methodology', 'experiments', 'results', 'conclusion', 'references'];
        for (const d of dims) {
          const raw = parsed[d];
          let score = 80;
          let reason = 'Evaluation based on paper text.';
          if (typeof raw === 'number') {
            score = Math.min(100, Math.max(0, Math.round(raw)));
          } else if (raw && typeof raw.score === 'number') {
            score = Math.min(100, Math.max(0, Math.round(raw.score)));
            reason = raw.reason || reason;
          } else if (raw && typeof raw.score === 'string') {
            const num = parseInt(raw.score, 10);
            if (!isNaN(num)) score = Math.min(100, Math.max(0, num));
            reason = raw.reason || reason;
          }
          parsed[d] = { score, reason };
          sum += score;
          count++;
        }
        parsed.overall = Math.round(sum / count);
        setCached(paper.id, provider.name, hash, 'analyze', JSON.stringify(parsed));
        return { ...parsed, isFallback: false };
      } catch (err) {
        if (i === 1) break;
      }
    }
  }
  
  return {
    isFallback: true,
    overall: 80,
    problem_statement: { score: 80, reason: 'Clear problem scoping and gap definition.' },
    literature_review: { score: 80, reason: 'Literature baseline coverage.' },
    methodology: { score: 80, reason: 'Methodological pipeline description.' },
    experiments: { score: 80, reason: 'Experimental protocol.' },
    results: { score: 80, reason: 'Results reporting.' },
    conclusion: { score: 80, reason: 'Conclusion takeaway.' },
    references: { score: 80, reason: 'Reference formatting.' }
  };
}

export async function reviewPaper(paper: any, userId: string) {
  const provider = getProvider(userId);
  const isAvail = provider ? await provider.isAvailable() : false;
  
  const text = paper.content_text || '';
  const hash = getContentHash(text);
  const currentModel = provider ? modelForProvider(provider.name) : 'default';
  
  if (provider && isAvail) {
    try {
      const cached = getCached(paper.id, provider.name, hash, 'review');
      if (cached) return { ...JSON.parse(cached.result), isFallback: false };
    } catch {}
    
    const chunks = db.prepare('SELECT chunk_index, content, section_name, page_number FROM paper_chunks WHERE paper_id = ?').all(paper.id) as any[];
    const sections = ['Abstract', 'Introduction', 'Methodology', 'Results', 'Conclusion', 'References'];
    let contextChunks: any[] = [];
    for (const sec of sections) {
      contextChunks.push(...selectSectionChunks(chunks, [sec], 1));
    }
    contextChunks = contextChunks.slice(0, 6);
    const context = buildCompactContext(contextChunks);
    
    const sysPrompt = 'You are a rigorous academic conference reviewer. Be specific. Base only on the paper. No fabricated results. Return ONLY valid JSON, no markdown.';
    const prompt = `Context:\n${context}\n\nReturn JSON: { "reviewer_analysis": "string (1 paragraph)", "strengths": ["string", "string", "string"], "weaknesses": ["string", "string", "string"], "reviewer_questions": ["string", "string", "string"], "recommendation": "Accept|Weak Accept|Borderline|Weak Reject|Reject" }`;
    
    for (let i = 0; i < 2; i++) {
      try {
        let resultText = await provider.generate(prompt, sysPrompt, 1024);
        logTokenUsage('review', provider.name, prompt.length + sysPrompt.length, currentModel);
        const parsed = extractJSON(resultText);
        
        const validRecs = ['Accept', 'Weak Accept', 'Borderline', 'Weak Reject', 'Reject'];
        if (!validRecs.includes(parsed.recommendation)) {
          throw new Error('Invalid recommendation');
        }
        
        setCached(paper.id, provider.name, hash, 'review', JSON.stringify(parsed));
        return { ...parsed, isFallback: false };
      } catch (err) {
        if (i === 1) break;
      }
    }
  }
  
  return {
    isFallback: true,
    reviewer_analysis: 'Fallback analysis',
    strengths: ['Fallback strength'],
    weaknesses: ['Fallback weakness'],
    reviewer_questions: ['Fallback question?'],
    recommendation: 'Borderline'
  };
}

export async function generateSummary(paper: any, userId: string) {
  const provider = getProvider(userId);
  const isAvail = provider ? await provider.isAvailable() : false;
  
  const text = paper.content_text || '';
  const hash = getContentHash(text);
  const currentModel = provider ? modelForProvider(provider.name) : 'default';
  
  if (provider && isAvail) {
    try {
      const cached = getCached(paper.id, provider.name, hash, 'summary');
      if (cached) return { ...JSON.parse(cached.result), isFallback: false, provider: provider.name };
    } catch {}
    
    const chunks = db.prepare('SELECT chunk_index, content, section_name, page_number FROM paper_chunks WHERE paper_id = ?').all(paper.id) as any[];
    const contextChunks = selectSectionChunks(chunks, ['Abstract', 'Introduction', 'Conclusion'], 4);
    const context = buildCompactContext(contextChunks);
    
    const paperSections = (typeof paper.sections === 'string' ? JSON.parse(paper.sections || '[]') : (paper.sections || [])).map((s: any) => s.heading || 'Unknown');
    
    const sysPrompt = 'You are an academic summarizer. Return ONLY valid JSON, no markdown.';
    const prompt = `Context:\n${context}\n\nSections in paper: ${paperSections.join(', ')}\n\nReturn JSON: { "one_line": "1 sentence", "executive": "3-5 sentences", "detailed": "1 academic paragraph", "sections": { "SectionName": "summary or 'Not available in this paper.'" } }. Only include sections that exist in the paper.`;
    
    try {
      let resultText = await provider.generate(prompt, sysPrompt, 1024);
      logTokenUsage('summary', provider.name, prompt.length + sysPrompt.length, currentModel);
      const parsed = extractJSON(resultText);
      setCached(paper.id, provider.name, hash, 'summary', JSON.stringify(parsed));
      return { ...parsed, isFallback: false, provider: provider.name };
    } catch (err) {
      console.error(err);
    }
  }
  
  return {
    isFallback: true,
    provider: 'none',
    one_line: 'Fallback summary',
    executive: 'Fallback summary',
    detailed: 'Fallback summary',
    sections: {}
  };
}
