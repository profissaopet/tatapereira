import { createSession, verifySession, sessionCookie, clearCookie } from './_lib/auth.js';

const MAKE_WEBHOOK_URL = process.env.MAKE_ENTREGAS_WEBHOOK_URL ||
  'https://hook.eu1.make.com/06vm4be7flav9iz4mjb1pbuqer1krqry';

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function normalizePhone(value = '') {
  // Remove caracteres não-numéricos
  const digits = String(value).replace(/\D/g, '');

  // Remove o prefixo '55' se já existir para evitar duplicação
  const withoutPrefix = digits.startsWith('55') ? digits.substring(2) : digits;

  // Garante que o número final tenha o código do país (55) para consistência com o banco de dados.
  return `55${withoutPrefix}`;
}

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      const session = verifySession(request);
      return session ? response.status(200).json({ ok: true, usuario: session }) : response.status(401).json({ ok: false });
    }

    if (request.method === 'DELETE') {
      response.setHeader('Set-Cookie', clearCookie());
      return response.status(200).json({ ok: true });
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST, DELETE');
      return response.status(405).json({ ok: false, message: 'Método não permitido.' });
    }

    let body = request.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const email = normalizeEmail(body.email);
    const telefone = normalizePhone(body.telefone);
    if (!email || !email.includes('@') || telefone.length < 12) {
      return response.status(400).json({ ok: false, message: 'Informe o e-mail e o telefone usados na compra.' });
    }

    const makeResponse = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acao: 'validar_acesso', email, telefone }),
      signal: AbortSignal.timeout(20000)
    });
    const text = await makeResponse.text();
    
    // Função auxiliar para tentar fazer parse de JSON mesmo com dupla serialização ou wrappers
    let data = {};
    try {
      let cleanedText = text.trim();
      // Remove prefixos eventuais como "BodyLong String" ou markdown
      if (cleanedText.startsWith('BodyLong String')) {
        cleanedText = cleanedText.replace(/^BodyLong String\s*/i, '');
      }
      data = JSON.parse(cleanedText);
      // Se data ainda for string (dupla serialização)
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch {}
      }
      // Se vier dentro de um wrapper data, body ou usuario
      if (data && typeof data === 'object') {
        if (data.data && typeof data.data === 'object') data = { ...data, ...data.data };
        if (data.usuario && typeof data.usuario === 'object') data = { ...data, ...data.usuario };
        if (typeof data.body === 'string') {
          try { const parsedBody = JSON.parse(data.body); data = { ...data, ...parsedBody }; } catch {}
        }
      }
    } catch {
      data = {};
    }

    const autorizado = data.autorizado === true || String(data.autorizado || '').toLowerCase() === 'true';
    if (!makeResponse.ok || !autorizado) {
      return response.status(401).json({ ok: false, message: data.mensagem || data.message || 'Compra não localizada com esses dados.' });
    }

    const progressMap = {
      m0: 'missao-zero', 'missao-zero': 'missao-zero', 'missão-zero': 'missao-zero',
      d1: 'dia-1', 'dia-1': 'dia-1',
      d2: 'dia-2', 'dia-2': 'dia-2',
      d3: 'dia-3', 'dia-3': 'dia-3',
      d4: 'dia-4', 'dia-4': 'dia-4',
      d5: 'dia-5', 'dia-5': 'dia-5',
      d6: 'dia-6', 'dia-6': 'dia-6',
      d7: 'dia-7', 'dia-7': 'dia-7'
    };

    // Processa o progresso se vier como objeto ou string
    let progressoObj = data.progresso;
    if (typeof progressoObj === 'string') {
      try { progressoObj = JSON.parse(progressoObj); } catch { progressoObj = {}; }
    }
    progressoObj = (progressoObj && typeof progressoObj === 'object') ? progressoObj : {};

    const concludedSet = new Set();

    // 1. Verifica no objeto progresso (ex: { M0: "ENTREGUE", D1: "ENTREGUE" })
    Object.entries(progressoObj).forEach(([code, val]) => {
      const codeKey = String(code).trim().toLowerCase();
      const valStr = String(val || '').trim().toLowerCase();
      if (valStr && valStr !== 'false' && valStr !== '0' && progressMap[codeKey]) {
        concludedSet.add(progressMap[codeKey]);
      }
    });

    // 2. Verifica nas colunas na raiz (ex: data.M0 = "ENTREGUE")
    ['M0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].forEach(code => {
      const codeKey = code.toLowerCase();
      const valStr = String(data[code] || data[codeKey] || '').trim().toLowerCase();
      if (valStr && valStr !== 'false' && valStr !== '0' && progressMap[codeKey]) {
        concludedSet.add(progressMap[codeKey]);
      }
    });

    // 3. Verifica em desafios_concluidos (seja array ou string separada por vírgula)
    let rawDesafios = data.desafios_concluidos || data.desafios || data.concluidos || [];
    if (typeof rawDesafios === 'string') {
      rawDesafios = rawDesafios.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (Array.isArray(rawDesafios)) {
      rawDesafios.forEach(item => {
        const itemKey = String(item).trim().toLowerCase();
        if (progressMap[itemKey]) {
          concludedSet.add(progressMap[itemKey]);
        } else if (itemKey) {
          concludedSet.add(itemKey);
        }
      });
    }

    const desafios = Array.from(concludedSet);
    const nome = String(data.nome || data.Nome || data.name || data.Name || data.aluna || data.buyer_name || data.full_name || '').trim();

    const usuario = {
      email,
      telefone,
      nome,
      cliente_id: String(data.cliente_id || data.transaction_id || data.transacao_id || '').trim(),
      desafios_concluidos: desafios,
      desafio_pendente: String(data.desafio_pendente || '').trim()
    };
    response.setHeader('Set-Cookie', sessionCookie(createSession(usuario)));
    return response.status(200).json({ ok: true, usuario });
  } catch (error) {
    console.error('Authentication error', error);
    return response.status(502).json({ ok: false, message: 'Não foi possível validar agora. Tente novamente em instantes.' });
  }
}
