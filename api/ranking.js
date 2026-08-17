import fetch from 'node-fetch';

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
  if (req.method === 'POST') {
    if (req.body.acao === 'ranking') {
      try {
        const response = await fetch(MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acao: 'ranking' }) // Sending action to Make.com
        });
        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error('A resposta da API não é um array.');
        }

        const rankingData = data.map(item => {
          const progresso = item.progresso || {};
          const xp = Object.keys(progresso).reduce((total, challengeCode) => {
            const challenge = CHALLENGES.find(c => c.code === challengeCode);
            if (challenge && progresso[challengeCode]) {
              return total + challenge.xp;
            }
            return total;
          }, 0);

          return {
            nome: item.nome,
            xp: xp
          };
        }).sort((a, b) => b.xp - a.xp);

        res.status(200).json(rankingData);
      } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar o ranking.', error: error.message });
      }
    } else {
      res.status(400).json({ message: 'Ação inválida.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Método ${req.method} não permitido.`);
  }
}