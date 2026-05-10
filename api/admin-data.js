const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_ID     = '97feaa37-41c7-4fa4-a8b8-0e9b265cd7cb';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token ausente' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user || user.id !== ADMIN_ID) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { action, targetUserId, payload = {} } = req.body;

  try {
    switch (action) {

      case 'loadProfiles': {
        const { data, error } = await sb.from('doctor_profiles').select('*').order('nome');
        if (error) throw error;
        return res.json({ data });
      }

      case 'loadCarousels': {
        const { data, error } = await sb
          .from('saved_carousels').select('*')
          .eq('user_id', targetUserId)
          .order('updated_at', { ascending: false });
        if (error) throw error;
        return res.json({ data });
      }

      case 'loadVirals': {
        const { data, error } = await sb
          .from('viral_structures').select('*')
          .eq('user_id', targetUserId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return res.json({ data });
      }

      case 'saveCarousel': {
        const { id, row } = payload;
        if (id) {
          const { data, error } = await sb
            .from('saved_carousels').update(row).eq('id', id).select().single();
          if (error) throw error;
          return res.json({ data });
        } else {
          const { data, error } = await sb
            .from('saved_carousels').insert({ ...row, user_id: targetUserId }).select().single();
          if (error) throw error;
          return res.json({ data });
        }
      }

      case 'deleteCarousel': {
        const { error } = await sb.from('saved_carousels').delete().eq('id', payload.id);
        if (error) throw error;
        return res.json({ success: true });
      }

      case 'saveViral': {
        const { data, error } = await sb
          .from('viral_structures').insert({ ...payload.row, user_id: targetUserId }).select().single();
        if (error) throw error;
        return res.json({ data });
      }

      case 'deleteViral': {
        const { error } = await sb.from('viral_structures').delete().eq('id', payload.id);
        if (error) throw error;
        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: 'Ação desconhecida' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
