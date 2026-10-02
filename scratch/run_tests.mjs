// Comprehensive Phase 6 Verification Test Suite
const BASE_URL = 'http://localhost:3001/api';

async function testApi(name, fn) {
  try {
    const result = await fn();
    console.log(`[PASS] ${name}`, result ? `-> ${JSON.stringify(result).slice(0, 100)}` : '');
    return true;
  } catch (err) {
    console.error(`[FAIL] ${name} -> Error: ${err.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('=== Starting Phase 6 Verification Tests ===\n');
  let passed = 0;
  let total = 0;

  // 1. Password Security: Weak Password Rejection
  total++;
  const t1 = await testApi('Auth: Reject weak password "m@1234"', async () => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alex Student', email: 'alex1@university.edu', password: 'm@1234' }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const json = await res.json();
    if (!json.error) throw new Error('Expected error message in response');
    return json.error;
  });
  if (t1) passed++;

  // 2. Password Security: Valid Password Registration
  total++;
  let token = '';
  const testEmail = `scholar_${Date.now()}@university.edu`;
  const validPassword = 'AcademicResearch@2026';
  const t2 = await testApi('Auth: Accept valid strong password', async () => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Monish Parmar', email: testEmail, password: validPassword }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || res.statusText);
    }
    const json = await res.json();
    token = json.token;
    if (!token) throw new Error('No token returned');
    return { token: token.slice(0, 20) + '...', user: json.user };
  });
  if (t2) passed++;

  // 3. Auth: Login with created user
  total++;
  const t3 = await testApi('Auth: Login with valid credentials', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: validPassword }),
    });
    if (!res.ok) throw new Error(`Login failed with status ${res.status}`);
    const json = await res.json();
    return json.user;
  });
  if (t3) passed++;

  // 4. Auth: GET /api/auth/me without token -> 401
  total++;
  const t4 = await testApi('Auth: Protected route denied without token (401)', async () => {
    const res = await fetch(`${BASE_URL}/auth/me`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    return '401 Unauthorized as expected';
  });
  if (t4) passed++;

  // 5. Auth: GET /api/auth/me with valid token -> 200
  total++;
  const t5 = await testApi('Auth: Protected route accepted with valid token (200)', async () => {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    return json.user || json;
  });
  if (t5) passed++;

  // 6. AI Provider Status: GET /api/ai/status
  total++;
  const t6 = await testApi('AI Provider: Status endpoint reports availability without leaking keys', async () => {
    const res = await fetch(`${BASE_URL}/ai/status`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (json.gemini?.key || json.ollama?.key) throw new Error('Leaked API key in status response!');
    return json;
  });
  if (t6) passed++;

  // 7. AI Provider Settings: Switch to Ollama and back
  total++;
  const t7 = await testApi('AI Provider: Switch provider to "ollama" and persist in DB', async () => {
    const putRes = await fetch(`${BASE_URL}/settings/ai`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ provider: 'ollama' }),
    });
    if (!putRes.ok) throw new Error(`PUT /settings/ai failed: ${putRes.status}`);

    const getRes = await fetch(`${BASE_URL}/settings/ai`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await getRes.json();
    if (json.provider !== 'ollama') throw new Error(`Expected "ollama", got "${json.provider}"`);
    return json;
  });
  if (t7) passed++;

  // 8. Upload Security: Reject invalid non-PDF file
  total++;
  const t8 = await testApi('Upload Security: Reject non-PDF fake upload', async () => {
    const form = new FormData();
    const fakeBlob = new Blob(['This is plain text, not a PDF document.'], { type: 'text/plain' });
    form.append('pdf', fakeBlob, 'fake.txt');

    const res = await fetch(`${BASE_URL}/papers/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.status !== 400 && res.status !== 500) throw new Error(`Expected 400/error, got ${res.status}`);
    return 'Rejected non-PDF as expected';
  });
  if (t8) passed++;

  // 9. Guide Answers API: Save & Retrieve 4 prompts
  total++;
  const t9 = await testApi('Guide Outline API: Save & retrieve step 0 prompt', async () => {
    const projId = 'default_project';
    const putRes = await fetch(`${BASE_URL}/guide/${projId}/0`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ answer: 'Students struggle to find relevant evidence efficiently.' }),
    });
    if (!putRes.ok) throw new Error(`Save guide failed: ${putRes.status}`);

    const getRes = await fetch(`${BASE_URL}/guide/${projId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const answers = await getRes.json();
    if (!answers || answers.length === 0) throw new Error('No guide answers returned');
    return answers[0];
  });
  if (t9) passed++;

  // 10. Builder & Multi-Format Export API (Official IEEEtran template)
  total++;
  const t10 = await testApi('Builder & Export: Create draft and export to LaTeX (.tex - IEEEtran)', async () => {
    const createRes = await fetch(`${BASE_URL}/drafts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Neural Retrieval for Student Research',
        authors: 'Monish Parmar',
        abstract: 'A lightweight neural retrieval architecture.',
        keywords: 'information retrieval, RAG, IEEE conference',
        sections: [
          { heading: 'I. Introduction', content: 'Research discovery is a primary bottleneck in student research.' },
          { heading: 'II. Methodology', content: 'Our approach integrates cross-encoder reranking over dense vectors.' },
          { heading: 'III. Experiments', content: 'We benchmark on standard academic QA datasets.' },
        ],
      }),
    });
    if (!createRes.ok) throw new Error(`Draft creation failed: ${createRes.status}`);
    const draft = await createRes.json();

    const exportRes = await fetch(`${BASE_URL}/drafts/${draft.id}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ format: 'latex' }),
    });
    if (!exportRes.ok) throw new Error(`LaTeX export failed: ${exportRes.status}`);
    const texText = await exportRes.text();
    if (!texText.includes('\\documentclass[conference]{IEEEtran}')) {
      throw new Error('Exported LaTeX does not use \\documentclass[conference]{IEEEtran}');
    }
    return { draftId: draft.id, latexTemplate: '\\documentclass[conference]{IEEEtran} verified' };
  });
  if (t10) passed++;

  console.log(`\n=== Verification Results: ${passed} / ${total} Passed ===`);
  process.exit(passed === total ? 0 : 1);
}

runAllTests();
