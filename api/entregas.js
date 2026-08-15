const MAKE_WEBHOOK_URL = process.env.MAKE_ENTREGAS_WEBHOOK_URL ||
  'https://hook.eu1.make.com/06vm4be7flav9iz4mjb1pbuqer1krqry';
const { verifySession } = require('./_lib/auth');

const MAX_BODY_BYTES = 4.25 * 1024 * 1024;

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ ok: false, message: 'Método não permitido.' });
  }

  const session = verifySession(request);
  if (!session) return response.status(401).json({ ok: false, message: 'Sua sessão expirou. Valide novamente o acesso.' });

  const contentType = request.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return response.status(415).json({ ok: false, message: 'Formato de envio inválido.' });
  }

  try {
    const chunks = [];
    let received = 0;

    for await (const chunk of request) {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        return response.status(413).json({ ok: false, message: 'O envio ultrapassa o limite de 4 MB.' });
      }
      chunks.push(chunk);
    }

    const makeResponse = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': contentType, 'x-domus-action': 'entregar_desafio', 'x-domus-auth-email': session.email, 'x-domus-auth-phone': session.telefone },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(25000)
    });

    const responseText = await makeResponse.text();
    if (!makeResponse.ok) {
      console.error('Make webhook error', makeResponse.status, responseText.slice(0, 500));
      return response.status(502).json({ ok: false, message: 'O Make não confirmou a entrega. Tente novamente.' });
    }

    return response.status(200).json({ ok: true, message: 'Desafio entregue com sucesso.' });
  } catch (error) {
    console.error('Submission proxy error', error);
    return response.status(500).json({ ok: false, message: 'Não foi possível enviar agora. Tente novamente em instantes.' });
  }
};
