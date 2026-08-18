const CHALLENGES = [
  { id: 'missao-zero', code: 'M0', xp: 10, meta: 'Missão Zero • 10 XP', title: 'Mapa de Avaliação' },
  { id: 'dia-1', code: 'D1', xp: 10, meta: 'Dia 1 • 10 XP', title: 'Fluxo de avaliação' },
  { id: 'dia-2', code: 'D2', xp: 20, meta: 'Dia 2 • 20 XP', title: 'Anamnese' },
  { id: 'dia-3', code: 'D3', xp: 20, meta: 'Dia 3 • 20 XP', title: 'Observação presencial' },
  { id: 'dia-4', code: 'D4', xp: 20, meta: 'Dia 4 • 20 XP', title: 'Matriz de decisão' },
  { id: 'dia-5', code: 'D5', xp: 10, meta: 'Dia 5 • 10 XP', title: 'POP escrito' },
  { id: 'dia-6', code: 'D6', xp: 10, meta: 'Dia 6 • 10 XP', title: 'Dados e indicadores' },
  { id: 'dia-7', code: 'D7', xp: 0, meta: 'Dia 7 • Grande marco', title: 'Entrega das chaves' }
];

const MAKE_WEBHOOK_URL = process.env.MAKE_ENTREGAS_WEBHOOK_URL || 'https://hook.eu1.make.com/06vm4be7flav9iz4mjb1pbuqer1krqry';

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
    let data = [];

    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        data = parsed;
      } else if (parsed && Array.isArray(parsed.ranking)) {
        data = parsed.ranking;
      } else if (parsed && Array.isArray(parsed.data)) {
        data = parsed.data;
      }
    } catch {
      // Se o Make retornar texto puro como "Accepted", trata como lista vazia
      data = [];
    }

    const rankingData = (Array.isArray(data) ? data : []).map(item => {
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