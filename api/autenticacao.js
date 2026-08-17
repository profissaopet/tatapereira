import { createSession, verifySession, sessionCookie, clearCookie } from './_lib/auth.js';
import fetch from 'node-fetch';

const MAKE_WEBHOOK_URL = process.env.MAKE_ENTREGAS_WEBHOOK_URL ||
  'https://hook.eu1.make.com/06vm4be7flav9iz4mjb1pbuqer1krqry';

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function normalizePhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    const session = verifySession(request);
    return session ? response.status(200).json({ ok: true, usuario: session }) : response.status(401).json({ ok: false });
  }

  if (request.method === 'DELETE') {
    response.setHeader('Set-Cookie', clearCookie());
    return response.status(200).json({ ok: true });
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET', POST, DELETE');
    return response.status(405).json({ ok: false, message: 'Método não permitido.' });
  }

  const email = normalizeEmail(request.body?.email);
  const telefone = normalizePhone(request.body?.telefone);
  if (!email || !email.includes('@') || telefone.length < 12) {
    return response.status(400).json({ ok: false, message: 'Informe o e-mail e o telefone usados na compra.' });
  }

  try {
    const makeResponse = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acao: 'validar_acesso', email, telefone }),
      signal: AbortSignal.timeout(20000)
    });
    const text = await makeResponse.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = {}; }
    const autorizado = data.autorizado === true || data.autorizado === 'true';
    if (!makeResponse.ok || !autorizado) {
      return response.status(401).json({ ok: false, message: data.mensagem || 'Compra não localizada com esses dados.' });
    }

    const progressMap = { M0: 'missao-zero', D1: 'dia-1', D2: 'dia-2', D3: 'dia-3', D4: 'dia-4', D5: 'dia-5', D6: 'dia-6', D7: 'dia-7' };
    const fromProgress = data.progresso && typeof data.progresso === 'object' ? Object.entries(progressMap).filter(([column]) => String(data.progresso[column] || '').trim() !== '').map(([, challenge]) => challenge) : [];
    const desafios = fromProgress.length ? fromProgress : Array.isArray(data.desafios_concluidos) ? data.desafios_concluidos : String(data.desafios_concluidos || '').split(',').map(item => item.trim()).filter(Boolean);
    const usuario = { email, telefone, nome: String(data.nome || '').trim(), cliente_id: String(data.cliente_id || '').trim(), desafios_concluidos: desafios };
    response.setHeader('Set-Cookie', sessionCookie(createSession(usuario)));
    return response.status(200).json({ ok: true, usuario });
  } catch (error) {
    console.error('Authentication error', error);
    return response.status(502).json({ ok: false, message: 'Não foi possível validar agora. Tente novamente em instantes.' });
  }
}
