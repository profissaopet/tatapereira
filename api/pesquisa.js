import { verifySession } from './_lib/auth.js';

const WEBHOOK = process.env.MAKE_PESQUISA_WEBHOOK_URL || 'https://hook.eu1.make.com/8axonap2my96nrtk1hqc29ilt5k0tvb3';
const AULAS = {
  D1:['Fluxo de avaliação','2026-08-24T21:00:00-03:00'], D2:['Anamnese','2026-08-25T21:00:00-03:00'],
  D3:['Observação presencial','2026-08-26T21:00:00-03:00'], D4:['Matriz de decisão','2026-08-27T21:00:00-03:00'],
  D5:['POP escrito','2026-08-28T21:00:00-03:00'], D6:['Dados e indicadores','2026-08-29T21:00:00-03:00'],
  D7:['Imersão DOMUS','2026-08-30T21:00:00-03:00']
};
const validScore = (v,min,max) => Number.isInteger(Number(v)) && Number(v)>=min && Number(v)<=max;

export default async function handler(req,res) {
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,message:'Método não permitido.'});}
  const session=verifySession(req);
  if(!session)return res.status(401).json({ok:false,message:'Sua sessão expirou. Valide novamente o acesso.'});
  let body=req.body;
  if(typeof body==='string'){try{body=JSON.parse(body)}catch{body={}}} body=body||{};
  const code=String(body.aula||'').toUpperCase(), aula=AULAS[code];
  if(!aula)return res.status(400).json({ok:false,message:'Aula inválida.'});
  const admin=String(session.email||'').toLowerCase()==='juangomes.sales@gmail.com';
  if(!admin && Date.now()<new Date(aula[1]).getTime())return res.status(403).json({ok:false,message:'Esta pesquisa será liberada após a aula, às 21h.'});
  if(!validScore(body.avaliacao,1,5))return res.status(400).json({ok:false,message:'Escolha uma nota de 1 a 5.'});
  const payload={acao:'responder_pesquisa',origem:'portal-pesquisa-domus',aula:code,titulo_aula:aula[0],nome:session.nome||'',email:session.email||'',telefone:session.telefone||'',cliente_id:session.cliente_id||'',avaliacao:Number(body.avaliacao),comentario:String(body.comentario||'').trim().slice(0,1500),enviado_em:new Date().toISOString()};
  try{
    const out=await fetch(WEBHOOK,{method:'POST',headers:{'content-type':'application/json','x-domus-action':'responder_pesquisa'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
    const text=await out.text();
    if(!out.ok){console.error('Survey webhook error',out.status,text.slice(0,500));return res.status(502).json({ok:false,message:'Não foi possível confirmar sua resposta. Tente novamente.'});}
    return res.status(200).json({ok:true,message:'Pesquisa enviada. Obrigada por ajudar a melhorar o desafio!'});
  }catch(error){console.error('Survey submission error',error);return res.status(500).json({ok:false,message:'Não foi possível enviar agora. Tente novamente em instantes.'});}
}
