
const API_BASE = '/api';


function getToken(): string | null {
  return localStorage.getItem('rl_token');
}

export function setToken(token: string): void {
  localStorage.setItem('rl_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('rl_token');
}


async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearToken();
  }

  return response;
}

async function apiJson<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
  }
  return data;
}


export interface User {
  id: string;
  email: string;
  name: string;
}

export async function register(email: string, password: string, name: string): Promise<{ user: User; token: string }> {
  const data = await apiJson<{ user: User; token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
  setToken(data.token);
  return data;
}

export async function login(email: string, password: string): Promise<{ user: User; token: string }> {
  const data = await apiJson<{ user: User; token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function getMe(): Promise<User> {
  return apiJson<User>('/auth/me');
}


export interface PaperSection {
  heading: string;
  content: string;
  page?: number;
}

export interface Paper {
  id: string;
  filename: string;
  original_name: string;
  title: string;
  authors: string;
  abstract: string;
  content_text: string;
  sections: PaperSection[];
  metadata: Record<string, any>;
  upload_date: string;
}

export async function uploadPaper(file: File): Promise<Paper> {
  const formData = new FormData();
  formData.append('pdf', file);
  return apiJson<Paper>('/papers/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function getPapers(): Promise<Paper[]> {
  return apiJson<Paper[]>('/papers');
}

export async function getPaper(id: string): Promise<Paper> {
  return apiJson<Paper>(`/papers/${id}`);
}

export async function deletePaper(id: string): Promise<void> {
  await apiJson(`/papers/${id}`, { method: 'DELETE' });
}


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

export async function analyzePaper(id: string): Promise<AnalysisScore> {
  return apiJson<AnalysisScore>(`/papers/${id}/analyze`, { method: 'POST' });
}

export async function getAnalysis(id: string): Promise<AnalysisScore | null> {
  try {
    return await apiJson<AnalysisScore>(`/papers/${id}/analysis`);
  } catch {
    return null;
  }
}


export interface ReviewComment {
  aspect: string;
  comment: string;
  severity: 'minor' | 'major' | 'positive';
}

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

export async function runReview(id: string): Promise<Review[]> {
  return apiJson<Review[]>(`/papers/${id}/review`, { method: 'POST' });
}

export async function getReviews(id: string): Promise<Review[]> {
  try {
    return await apiJson<Review[]>(`/papers/${id}/reviews`);
  } catch {
    return [];
  }
}


export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
}

export async function sendChatMessage(paperId: string, message: string): Promise<ChatMessage> {
  return apiJson<ChatMessage>(`/papers/${paperId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function getChatHistory(paperId: string): Promise<ChatMessage[]> {
  try {
    return await apiJson<ChatMessage[]>(`/papers/${paperId}/chat`);
  } catch {
    return [];
  }
}


export interface DraftSection {
  heading: string;
  content: string;
}

export interface Draft {
  id: string;
  paper_id?: string;
  title: string;
  authors: string;
  abstract: string;
  keywords: string;
  sections: DraftSection[];
  source_data: string;
  format_applied: boolean;
  created_at: string;
  updated_at: string;
}

export async function getDrafts(): Promise<Draft[]> {
  return apiJson<Draft[]>('/drafts');
}

export async function createDraft(data: Partial<Draft>): Promise<Draft> {
  return apiJson<Draft>('/drafts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDraft(id: string, data: Partial<Draft>): Promise<Draft> {
  return apiJson<Draft>(`/drafts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getDraft(id: string): Promise<Draft> {
  return apiJson<Draft>(`/drafts/${id}`);
}

export async function exportDraft(id: string, format: 'latex' | 'docx' | 'markdown'): Promise<Blob> {
  const response = await apiFetch(`/drafts/${id}/export`, {
    method: 'POST',
    body: JSON.stringify({ format }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Export failed');
  }
  return response.blob();
}


export interface GuideAnswer {
  step_index: number;
  answer: string;
}

export async function getGuideAnswers(projectId: string): Promise<GuideAnswer[]> {
  try {
    return await apiJson<GuideAnswer[]>(`/guide/${projectId}`);
  } catch {
    return [];
  }
}

export async function saveGuideAnswer(projectId: string, stepIndex: number, answer: string): Promise<void> {
  await apiJson(`/guide/${projectId}/${stepIndex}`, {
    method: 'PUT',
    body: JSON.stringify({ answer }),
  });
}

export async function getAiProvider(): Promise<{ provider: 'gemini' | 'ollama' }> {
  return apiJson<{ provider: 'gemini' | 'ollama' }>('/settings/ai');
}

export async function setAiProvider(provider: 'gemini' | 'ollama'): Promise<void> {
  await apiJson('/settings/ai', { method: 'PUT', body: JSON.stringify({ provider }) });
}

export async function getAiStatus(): Promise<{
  gemini: { available: boolean; model?: string; reason?: string };
  ollama: { available: boolean; model?: string; reason?: string };
}> {
  return apiJson('/ai/status');
}

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
  return apiJson<PaperSummary>(`/papers/${paperId}/summary`, { method: 'POST' });
}

export async function getSummary(paperId: string): Promise<PaperSummary | null> {
  try {
    return await apiJson<PaperSummary>(`/papers/${paperId}/summary`);
  } catch {
    return null;
  }
}
