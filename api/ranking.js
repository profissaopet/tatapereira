const CHALLENGES = [
  { id: 'missao-zero', code: 'M0', xp: 10, meta: 'Missão Zero • 10 TJ', title: 'Mapa de Avaliação' },
  { id: 'dia-1', code: 'D1', xp: 10, meta: 'Dia 1 • 10 TJ', title: 'Fluxo de avaliação' },
  { id: 'dia-2', code: 'D2', xp: 20, meta: 'Dia 2 • 20 TJ', title: 'Anamnese' },
  { id: 'dia-3', code: 'D3', xp: 20, meta: 'Dia 3 • 20 TJ', title: 'Observação presencial' },
  { id: 'dia-4', code: 'D4', xp: 20, meta: 'Dia 4 • 20 TJ', title: 'Matriz de decisão' },
  { id: 'dia-5', code: 'D5', xp: 10, meta: 'Dia 5 • 10 TJ', title: 'POP escrito' },
  { id: 'dia-6', code: 'D6', xp: 10, meta: 'Dia 6 • 10 TJ', title: 'Dados e indicadores' },
  { id: 'dia-7', code: 'D7', xp: 0, meta: 'Dia 7 • Grande marco', title: 'Entrega das chaves' }
];

const MAKE_WEBHOOK_URL = process.env.MAKE_ENTREGAS_WEBHOOK_URL || 'https://hook.eu1.make.com/06vm4be7flav9iz4mjb1pbuqer1krqry';

function parseMakeResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const text = rawText.trim();

  // 1. Tenta JSON.parse padrão
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.ranking)) return parsed.ranking;
    if (parsed && Array.isArray(parsed.data)) return parsed.data;
    if (parsed && Array.isArray(parsed.participantes)) return parsed.participantes;
    if (parsed && Array.isArray(parsed.alunos)) return parsed.alunos;
    if (parsed && typeof parsed === 'object') return [parsed];
  } catch (e) {}

  // 2. Corrige resposta do Make onde objetos foram agregados sem vírgulas
  try {
    const sanitized = text.replace(/}\s*\{/g, '},{');
    const parsed = JSON.parse(sanitized);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {}

  // 3. Fallback regex para extrair todos os objetos individuais {...}
  try {
    const matches = text.match(/\{[^{}]+\}/g) || [];
    const items = [];
    for (const m of matches) {
      try {
        const item = JSON.parse(m);
        if (item && typeof item === 'object') items.push(item);
      } catch (e) {}
    }
    if (items.length > 0) return items;
  } catch (e) {}

  return [];
}

export default async function handler(req, res) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const isRankingAction = (req.method === 'POST' && body.acao === 'ranking') || (req.method === 'GET');

  if (!isRankingAction) {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ message: `Método ${req.method} não permitido.` });
  }

  try {
    const response = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'ranking' }),
      signal: AbortSignal.timeout(15000)
    });

    const rawText = await response.text();
    const data = parseMakeResponse(rawText);

    const rankingData = data.map(item => {
      if (!item || typeof item !== 'object') return null;
      
      // Se a planilha já enviar o xp_total ou xp pronto:
      const directXP = item.xp_total !== undefined ? Number(item.xp_total) : (item.xp !== undefined ? Number(item.xp) : null);
      
      let finalXP = 0;
      if (directXP !== null && !isNaN(directXP)) {
        finalXP = directXP;
      } else {
        // Caso contrário, calcula a partir dos desafios entregues (M0..D7)
        const progresso = (item.progresso && typeof item.progresso === 'object') ? item.progresso : item;
        finalXP = Object.keys(progresso).reduce((total, challengeCode) => {
          const challenge = CHALLENGES.find(c => c.code.toLowerCase() === challengeCode.toLowerCase());
          if (challenge && String(progresso[challengeCode] || '').trim() !== '') {
            return total + challenge.xp;
          }
          return total;
        }, 0);
      }

      return {
        nome: String(item.nome || 'Participante').trim(),
        xp: finalXP
      };
    }).filter(Boolean).sort((a, b) => b.xp - a.xp);

    return res.status(200).json(rankingData);
  } catch (error) {
    console.error('Erro ao buscar o ranking:', error);
    return res.status(200).json([]);
  }
}