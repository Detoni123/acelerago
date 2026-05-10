export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const geminiKey = process.env.GEMINI_API_KEY || req.headers['x-gemini-key'];
  if (!geminiKey) return res.status(400).json({ error: 'Chave API Gemini não configurada.' });

  const { model, payload } = req.body;
  if (!model || !payload) return res.status(400).json({ error: 'Missing model or payload' });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  res.status(response.status).json(data);
}
