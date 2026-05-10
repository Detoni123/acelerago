const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_ID     = '97feaa37-41c7-4fa4-a8b8-0e9b265cd7cb';

function verifyAdminToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const pad = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(pad, 'base64').toString('utf8'));
    if (payload.sub !== ADMIN_ID) return false;
    if (payload.exp < Date.now() / 1000) return false;
    return true;
  } catch { return false; }
}

async function sbFetch(path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  const data = JSON.parse(text);
  if (!res.ok) throw new Error(data?.message || data?.error || `Supabase ${res.status}`);
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || !verifyAdminToken(token)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { action, targetUserId, payload = {} } = req.body;

  try {
    switch (action) {

      case 'loadProfiles': {
        const data = await sbFetch('/doctor_profiles?select=*&order=nome');
        return res.json({ data });
      }

      case 'loadCarousels': {
        const data = await sbFetch(`/saved_carousels?select=*&user_id=eq.${targetUserId}&order=updated_at.desc`);
        return res.json({ data });
      }

      case 'loadVirals': {
        const data = await sbFetch(`/viral_structures?select=*&user_id=eq.${targetUserId}&order=created_at.desc`);
        return res.json({ data });
      }

      case 'saveCarousel': {
        const { id, row } = payload;
        if (id) {
          const data = await sbFetch(`/saved_carousels?id=eq.${id}`, {
            method: 'PATCH', prefer: 'return=representation', body: row,
          });
          return res.json({ data: Array.isArray(data) ? data[0] : data });
        } else {
          const data = await sbFetch('/saved_carousels', {
            method: 'POST', prefer: 'return=representation',
            body: { ...row, user_id: targetUserId },
          });
          return res.json({ data: Array.isArray(data) ? data[0] : data });
        }
      }

      case 'deleteCarousel': {
        await sbFetch(`/saved_carousels?id=eq.${payload.id}`, { method: 'DELETE' });
        return res.json({ success: true });
      }

      case 'saveViral': {
        const data = await sbFetch('/viral_structures', {
          method: 'POST', prefer: 'return=representation',
          body: { ...payload.row, user_id: targetUserId },
        });
        return res.json({ data: Array.isArray(data) ? data[0] : data });
      }

      case 'deleteViral': {
        await sbFetch(`/viral_structures?id=eq.${payload.id}`, { method: 'DELETE' });
        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: 'Ação desconhecida' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
