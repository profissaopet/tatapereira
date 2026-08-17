
    export default async function handler(req, res) {
        if (req.method === 'GET') {
          try {
            // Em um cenário real, você buscaria e processaria os dados de um banco de dados.
            // Para este exemplo, usaremos dados mockados.
            const rankingData = [
              { nome: 'Juliana Paes', xp: 100 },
              { nome: 'Ana Oliveira', xp: 100 },
              { nome: 'Beatriz Costa', xp: 80 },
              { nome: 'Carla Dias', xp: 70 },
              { nome: 'Mariana Lima', xp: 50 },
              { nome: 'Fernanda Souza', xp: 40 },
              { nome: 'Gabriela Martins', xp: 30 },
              { nome: 'Helena Alves', xp: 20 },
              { nome: 'Isabela Gomes', xp: 10 },
              { nome: 'Laura Ribeiro', xp: 10 },
            ].sort((a, b) => b.xp - a.xp);
      
            res.status(200).json(rankingData);
          } catch (error) {
            res.status(500).json({ message: 'Erro ao buscar o ranking.', error: error.message });
          }
        } else {
          res.setHeader('Allow', ['GET']);
          res.status(405).end(`Método ${req.method} não permitido.`);
        }
      }
      
    
    