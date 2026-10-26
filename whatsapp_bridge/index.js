const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

process.on('unhandledRejection', (reason) => {
    console.error('[Aviso] Unhandled Rejection:', reason && reason.message ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Aviso] Uncaught Exception:', err && err.message ? err.message : err);
});

function cleanChromiumLocks(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                cleanChromiumLocks(fullPath);
            } else if (entry.name.startsWith('Singleton')) {
                try {
                    fs.unlinkSync(fullPath);
                    console.log(`[Auto-Clean] Removido lock residual do Chromium: ${fullPath}`);
                } catch (e) {
                    console.warn(`[Auto-Clean] Não foi possível remover ${fullPath}:`, e.message);
                }
            }
        }
    } catch (e) {
        console.warn(`[Auto-Clean] Erro ao varrer diretório ${dir}:`, e.message);
    }
}

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let pairingCode = null;
let pairingCodeTime = 0;
let pairError = null;
let isConnected = false;
let userPhoneNumber = process.env.PHONE_NUMBER || null;
let qrRaw = null;
let startTime = Math.floor(Date.now() / 1000);

let config = {
    botEnabled: true,
    ignoreGroups: true
};

let logs = [];
function addLog(tipo, telefone, texto) {
    const hora = new Date().toLocaleTimeString('pt-BR');
    logs.unshift({ hora, tipo, telefone: telefone.replace('@c.us', ''), texto });
    if (logs.length > 50) logs.pop();
}

// ── 📊 SISTEMA DE RASTREAMENTO (DELIVERY, LEITURA E CLIQUES) ───────────────────
const TRACKING_FILE = path.join(__dirname, 'tracking_dados.json');

function carregarTracking() {
    try {
        if (fs.existsSync(TRACKING_FILE)) {
            return JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[Tracking] Erro ao ler tracking_dados.json:', e.message);
    }
    return { links: {}, mensagens: {} };
}

function salvarTracking(dados) {
    try {
        fs.writeFileSync(TRACKING_FILE, JSON.stringify(dados, null, 2), 'utf8');
    } catch (e) {
        console.error('[Tracking] Erro ao salvar tracking_dados.json:', e.message);
    }
}

// Converte URLs normais em links curtos de rastreamento
function converterLinksEmRastreaveis(texto, telefone, passoId, reqHost, reqProtocol = 'http') {
    if (!texto) return texto;
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    return texto.replace(urlRegex, (urlOriginal) => {
        // Se já for link de rastreio, não altera
        if (urlOriginal.includes('/r/')) return urlOriginal;

        const tracking = carregarTracking();
        if (!tracking.links) tracking.links = {};

        // Cria token de 6 caracteres hexadecimais
        const trackId = crypto.randomBytes(3).toString('hex');
        const hostUrl = reqHost ? `${reqProtocol}://${reqHost}` : `http://localhost:${process.env.PORT || 3000}`;
        const urlRastreada = `${hostUrl}/r/${trackId}`;

        tracking.links[trackId] = {
            trackId,
            urlDestino: urlOriginal,
            telefone: (telefone || '').replace(/\D/g, ''),
            passoId: passoId || 'geral',
            criadoEm: new Date().toLocaleString('pt-BR'),
            clicado: false,
            totalCliques: 0
        };

        salvarTracking(tracking);
        return urlRastreada;
    });
}

let client = null;
let clientInitialized = false;

function criarClienteWhatsApp() {
    if (clientInitialized) return;
    cleanChromiumLocks(path.join(__dirname, '.wwebjs_auth'));
    cleanChromiumLocks(path.join(__dirname, '.wwebjs_cache'));

    client = new Client({
        authStrategy: new LocalAuth(),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/nicollasguedes/wa-version/main/html/2.3000.1017531677-alpha.html'
        },
        puppeteer: {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--single-process'
            ]
        }
    });

    clientInitialized = true;

    client.on('qr', async (qr) => {
        qrRaw = qr;
        isConnected = false;

        if (userPhoneNumber && !pairingCode) {
            console.log('WhatsApp Web pronto para pareamento. Solicitando código...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
                pairingCode = await client.requestPairingCode(userPhoneNumber);
                pairingCodeTime = Date.now();
                console.log(`\n===================================`);
                console.log(`CÓDIGO DE PAREAMENTO WHATSAPP: ${pairingCode}`);
                console.log(`===================================\n`);
            } catch (err) {
                console.error('Erro ao gerar código de pareamento:', err.message);
                pairError = err.message || 'Erro desconhecido ao gerar código';
            }
        }
    });

    client.on('ready', () => {
        console.log('✅ WhatsApp conectado e pronto!');
        isConnected = true;
        pairingCode = null;
        qrRaw = null;
        startTime = Math.floor(Date.now() / 1000) - 5;
    });

    client.on('disconnected', async () => {
        isConnected = false;
        pairingCode = null;
        userPhoneNumber = null;
        if (client) {
            try { await client.destroy(); } catch (e) {}
            client = null;
            clientInitialized = false;
        }
    });

    client.on('message', async (msg) => {
        if (!config.botEnabled) return;
        if (msg.from === 'status@broadcast') return;
        if (msg.fromMe) return;
        if (msg.from.endsWith('@g.us') && config.ignoreGroups) return;
        if (msg.timestamp < startTime) return;

        addLog('RECEBIDA', msg.from, msg.body || '[Mídia]');

        try {
            await axios.post(`${BACKEND_URL}/webhook/whatsapp`, {
                telefone: msg.from,
                texto: msg.body || '',
                nome: msg._data?.notifyName || null
            });
        } catch (error) {
            console.error('Erro ao enviar mensagem para backend Python:', error.message);
        }
    });

    // ── 👁️ RASTREAMENTO DE ENTREGA & LEITURA (TICKS DO WHATSAPP) ────────────────
    client.on('message_ack', async (msg, ack) => {
        try {
            const ackNomes = {
                '-1': 'ERRO',
                '0': 'PENDENTE',
                '1': 'ENVIADA',
                '2': 'RECEBIDA',
                '3': 'LIDA',
                '4': 'REPRODUZIDA'
            };
            const ackNome = ackNomes[String(ack)] || `STATUS_${ack}`;
            const msgId = (msg && msg.id) ? (msg.id._serialized || String(msg.id)) : '';
            if (!msgId) return;

            const destinatario = (msg.to || '').replace('@c.us', '').replace('@g.us', '');
            const tracking = carregarTracking();
            if (!tracking.mensagens) tracking.mensagens = {};
            const agora = new Date().toLocaleString('pt-BR');

            if (!tracking.mensagens[msgId]) {
                tracking.mensagens[msgId] = {
                    msgId,
                    telefone: destinatario,
                    ack,
                    ackNome,
                    atualizadoEm: agora
                };
            } else {
                tracking.mensagens[msgId].ack = ack;
                tracking.mensagens[msgId].ackNome = ackNome;
                tracking.mensagens[msgId].atualizadoEm = agora;
            }

            if (ack === 2) tracking.mensagens[msgId].dataRecebida = agora;
            if (ack === 3) tracking.mensagens[msgId].dataLida = agora;

            salvarTracking(tracking);

            // Repassa evento ao backend Python
            axios.post(`${BACKEND_URL}/api/rastreamento/ack`, {
                msgId,
                telefone: destinatario,
                ack,
                ackNome,
                data: agora
            }).catch(() => {});

            if (ack === 2 || ack === 3) {
                console.log(`[Rastreamento WPP] Mensagem ${msgId.slice(-8)} -> ${destinatario}: ${ackNome} (${ack})`);
            }
        } catch (e_ack) {
            console.error('[Rastreamento] Erro no message_ack:', e_ack.message);
        }
    });

    try {
        client.initialize().catch(err => {
            console.error('Erro na inicialização do Puppeteer/WhatsApp:', err.message);
        });
    } catch (e) {
        console.error('Exceção ao chamar initialize:', e.message);
    }
}

// ── API ROUTES ────────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
    // Mantém o código de pareamento ativo por 5 minutos
    if (pairingCode && pairingCodeTime && (Date.now() - pairingCodeTime > 300000)) {
        pairingCode = null;
        pairingCodeTime = 0;
    }
    res.json({ isConnected, pairingCode, userPhoneNumber, config, logs });
});

app.post('/api/config', (req, res) => {
    if (typeof req.body.botEnabled === 'boolean') config.botEnabled = req.body.botEnabled;
    if (typeof req.body.ignoreGroups === 'boolean') config.ignoreGroups = req.body.ignoreGroups;
    res.json({ success: true, config });
});

app.get('/api/leads', async (req, res) => {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/leads`);
        res.json(response.data);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/leads/limpar', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/leads/limpar`);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ status: 'error', error: 'Erro ao limpar dados de leads' });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/settings`);
        res.json(response.data);
    } catch (e) { res.status(500).json({}); }
});

app.post('/api/settings', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/settings`, req.body);
        res.json(response.data);
    } catch (e) { res.status(500).json({ error: 'Erro ao salvar configurações' }); }
});

app.get('/api/sessoes', async (req, res) => {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/sessoes`);
        res.json(response.data);
    } catch (e) { res.status(500).json({}); }
});

app.post('/api/voltar_bot', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/voltar_bot`, req.body);
        res.json(response.data);
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/pausar_bot', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/pausar_bot`, req.body);
        res.json(response.data);
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── ROTAS HOTMART & RÉGUA ─────────────────────────────────────────────────────
app.post('/webhook/hotmart', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/webhook/hotmart`, req.body);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ error: 'Erro ao repassar webhook para backend' });
    }
});

app.get('/api/hotmart/stats', async (req, res) => {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/hotmart/stats`);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ total_hotmart: 0, carrinhos_abandonados: 0, boletos_pix_gerados: 0, alunos_matriculados: 0, leads_recentes: [] });
    }
});

app.post('/api/hotmart/testar', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/hotmart/testar`, req.body);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/hotmart/regua/verificar_agora', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/hotmart/regua/verificar_agora`);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/hotmart/regua/testar_passo', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/hotmart/regua/testar_passo`, req.body);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/hotmart/cursos', async (req, res) => {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/hotmart/cursos`);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ cursos: [] });
    }
});

app.post('/api/hotmart/testar_grupo', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/hotmart/testar_grupo`, req.body);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ status: 'error', erro: e.message });
    }
});

app.post('/api/hotmart/disparo_curso', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/hotmart/disparo_curso`, req.body);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ status: 'error', erro: e.message });
    }
});

app.post('/api/hotmart/cursos/salvar', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/hotmart/cursos/salvar`, req.body);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ status: 'error', erro: e.message });
    }
});

// ── ROTAS DE LOG DE ACESSOS (HOTMART CLUB) ──────────────────────────────────
app.get('/api/hotmart/acessos', async (req, res) => {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/hotmart/acessos`);
        res.json(response.data);
    } catch (e) {
        res.status(500).json([]);
    }
});

app.post('/api/hotmart/acessos/limpar', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/hotmart/acessos/limpar`);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ status: 'error', erro: e.message });
    }
});

app.post('/api/hotmart/acessos/simular', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/hotmart/acessos/simular`, req.body);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ status: 'error', erro: e.message });
    }
});

// ── 🔗 RASTREADOR DE CLIQUES & REDIRECIONAMENTO DE LINKS ──────────────────────
app.get('/r/:trackId', async (req, res) => {
    try {
        const { trackId } = req.params;
        const tracking = carregarTracking();
        const linkInfo = tracking.links ? tracking.links[trackId] : null;

        if (!linkInfo || !linkInfo.urlDestino) {
            return res.status(404).send('<h3 style="font-family:sans-serif;text-align:center;margin-top:50px;">Link de acesso expirado ou não encontrado.</h3>');
        }

        const agora = new Date().toLocaleString('pt-BR');
        linkInfo.clicado = true;
        linkInfo.totalCliques = (linkInfo.totalCliques || 0) + 1;
        if (!linkInfo.primeiroClique) linkInfo.primeiroClique = agora;
        linkInfo.ultimoClique = agora;
        linkInfo.ultimoIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        linkInfo.userAgent = req.headers['user-agent'];

        salvarTracking(tracking);

        // Notifica o backend Python sobre o clique do aluno
        axios.post(`${BACKEND_URL}/api/rastreamento/clique`, {
            trackId,
            telefone: linkInfo.telefone,
            nome: linkInfo.nome,
            passoId: linkInfo.passoId,
            urlDestino: linkInfo.urlDestino,
            dataClique: agora
        }).catch(err => {
            console.warn('[Tracking Clique] Falha ao notificar backend:', err.message);
        });

        console.log(`[Link Rastreado] ✅ Clique confirmado! Aluno: ${linkInfo.telefone} -> Redirecionando para ${linkInfo.urlDestino}`);

        // Redireciona o aluno instantaneamente para o link original (Hotmart / Área de Membros)
        return res.redirect(302, linkInfo.urlDestino);
    } catch (e) {
        console.error('[Tracking Clique] Erro ao redirecionar:', e.message);
        res.status(500).send('Erro ao redirecionar link.');
    }
});

// Estatísticas globais de rastreamento (Mensagens enviadas, entregues, lidas e cliques)
app.get('/api/rastreamento/stats', (req, res) => {
    try {
        const tracking = carregarTracking();
        const msgs = Object.values(tracking.mensagens || {});
        const links = Object.values(tracking.links || {});

        const totalEnviadas = msgs.length;
        const totalRecebidas = msgs.filter(m => m.ack >= 2).length;
        const totalLidas = msgs.filter(m => m.ack >= 3).length;
        const totalLinks = links.length;
        const linksClicados = links.filter(l => l.clicado).length;
        const totalCliquesGeral = links.reduce((sum, l) => sum + (l.totalCliques || 0), 0);

        res.json({
            mensagens: {
                total_enviadas: totalEnviadas,
                total_recebidas: totalRecebidas,
                total_lidas: totalLidas,
                taxa_entrega: totalEnviadas > 0 ? `${((totalRecebidas / totalEnviadas) * 100).toFixed(1)}%` : '0%',
                taxa_leitura: totalEnviadas > 0 ? `${((totalLidas / totalEnviadas) * 100).toFixed(1)}%` : '0%'
            },
            links: {
                total_gerados: totalLinks,
                links_com_clique: linksClicados,
                total_cliques: totalCliquesGeral,
                taxa_clique: totalLinks > 0 ? `${((linksClicados / totalLinks) * 100).toFixed(1)}%` : '0%'
            },
            ultimos_cliques: links.filter(l => l.clicado).slice(-10).reverse()
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Consulta rastreamento de um telefone específico
app.get('/api/rastreamento/telefone/:tel', (req, res) => {
    try {
        const cleanTel = req.params.tel.replace(/\D/g, '');
        const tracking = carregarTracking();
        const msgs = Object.values(tracking.mensagens || {}).filter(m => m.telefone && m.telefone.includes(cleanTel));
        const links = Object.values(tracking.links || {}).filter(l => l.telefone && l.telefone.includes(cleanTel));

        res.json({
            telefone: cleanTel,
            mensagens: msgs,
            links: links,
            tem_leitura: msgs.some(m => m.ack >= 3),
            tem_clique: links.some(l => l.clicado)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/hotmart/cursos/:nome', async (req, res) => {
    try {
        const response = await axios.delete(`${BACKEND_URL}/api/hotmart/cursos/${encodeURIComponent(req.params.nome)}`);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ status: 'error', erro: e.message });
    }
});


// ── ROTAS PROXY IA ATENDENTE ──────────────────────────────────────────────────
app.get('/api/ia/modelos', async (req, res) => {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/ia/modelos`);
        res.json(response.data);
    } catch (e) { res.status(500).json({ online: false, modelos: [] }); }
});

app.get('/api/ia/config', async (req, res) => {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/ia/config`);
        res.json(response.data);
    } catch (e) { res.status(500).json({}); }
});

app.post('/api/ia/config', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/ia/config`, req.body);
        res.json(response.data);
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/ia/testar', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/ia/testar`);
        res.json(response.data);
    } catch (e) { res.status(500).json({ success: false, resposta: 'Erro no proxy' }); }
});

// ── QR CODE & PAREAMENTO ──────────────────────────────────────────────────────
app.get('/qr', (req, res) => {
    if (isConnected) return res.send('WhatsApp já está conectado!');
    if (!qrRaw) return res.send('QR Code ainda não foi gerado. Aguarde...');
    const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrRaw)}`;
    res.send(`
        <html>
            <body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;font-family:sans-serif;background:#0f172a;color:#f8fafc;">
                <h2 style="color:#f97316;">Escaneie o QR Code no seu WhatsApp</h2>
                <img src="${qrImg}" style="border:8px solid white;border-radius:12px;margin:20px 0;"/>
                <p style="color:#94a3b8;">Abra o WhatsApp ➔ Configurações ➔ Aparelhos Conectados ➔ Conectar um aparelho</p>
                <script>setInterval(() => { fetch('/api/status').then(r => r.json()).then(d => { if(d.isConnected) window.location.href = '/'; }); }, 2000);</script>
            </body>
        </html>
    `);
});

app.post('/api/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ success: false, error: 'Número de telefone obrigatório' });
    
    let cleanPhone = String(phoneNumber).replace(/\D/g, '');
    if ((cleanPhone.length === 10 || cleanPhone.length === 11) && !cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
    }
    userPhoneNumber = cleanPhone;
    pairingCode = null;
    pairError = null;

    console.log(`[Pair] Iniciando solicitação de código para: ${userPhoneNumber}`);

    // 1. Se o cliente já estiver iniciado e na tela de login/QR, tenta gerar o código diretamente
    if (client && client.pupPage && !client.pupPage.isClosed() && !isConnected) {
        try {
            console.log('[Pair] Tentando gerar código diretamente na página aberta...');
            const directCode = await Promise.race([
                client.requestPairingCode(userPhoneNumber),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de 8s na geração direta')), 8000))
            ]);
            if (directCode) {
                pairingCode = directCode;
                pairingCodeTime = Date.now();
                console.log(`[Pair] Código gerado com sucesso imediatamente: ${directCode}`);
                return res.json({ success: true, pairingCode: directCode });
            }
        } catch (directErr) {
            console.warn(`[Pair] Tentativa direta falhou (${directErr.message}). Reiniciando Chromium...`);
        }
    }

    // 2. Se a tentativa direta não funcionou ou o cliente não estava pronto, reinicia limpo
    if (client) {
        try { await client.destroy(); } catch (e) {}
        client = null;
        clientInitialized = false;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    criarClienteWhatsApp();

    let tentativas = 0;
    const interval = setInterval(() => {
        tentativas++;
        if (pairingCode) {
            pairingCodeTime = Date.now();
            clearInterval(interval);
            return res.json({ success: true, pairingCode });
        }
        if (pairError) {
            clearInterval(interval);
            return res.json({ success: false, error: `WhatsApp Web: ${pairError}. Dica: use o botão "Abrir QR Code" para conectar imediatamente.` });
        }
        if (tentativas > 40) {
            clearInterval(interval);
            return res.json({ 
                success: false, 
                error: 'O WhatsApp demorou para responder na nuvem. Você pode clicar no botão "Abrir QR Code" para conectar instantaneamente com a câmera do seu celular.' 
            });
        }
    }, 1000);
});

app.get('/reset', async (req, res) => {
    isConnected = false;
    pairingCode = null;
    qrRaw = null;
    if (client) {
        try { await client.destroy(); } catch (e) {}
        clientInitialized = false;
        client = null;
    }
    setTimeout(() => { criarClienteWhatsApp(); }, 2000);
    res.redirect('/');
});

// Função auxiliar para fallback seguro de chats
async function obterChatsFallback() {
    let leadsResp = [];
    try {
        const resp = await axios.get(`${BACKEND_URL}/api/leads`, { timeout: 4000 });
        if (Array.isArray(resp.data)) {
            leadsResp = resp.data;
        }
    } catch (e) {
        // backend offline ou indisponível
    }

    return (leadsResp || []).map(l => {
        const tel = l && l.telefone ? String(l.telefone).trim() : '';
        const nome = l && l.nome ? String(l.nome).trim() : '';
        return {
            id: tel || (l && l.id ? String(l.id) : `lead_${Math.random().toString(36).substring(2, 7)}`),
            name: nome || (tel ? tel.replace(/@c\.us|@lid/g, '') : 'Contato'),
            telefone: tel,
            unreadCount: 0,
            timestamp: Math.floor(Date.now() / 1000),
            lastMessage: `Status: ${(l && l.status) || 'Aluno'}`,
            isGroup: false,
            lead: l || null
        };
    });
}

// ── ATENDIMENTO WHATSAPP WEB EM TEMPO REAL ────────────────────────────────────
app.get('/api/whatsapp/chats', async (req, res) => {
    try {
        if (!client || !isConnected) {
            const fallbackChats = await obterChatsFallback();
            return res.json({ connected: false, chats: fallbackChats });
        }

        let chats = [];
        try {
            chats = await Promise.race([
                client.getChats(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao buscar chats do WhatsApp Web')), 6000))
            ]);
        } catch (chatErr) {
            console.warn('[WhatsApp] Aviso ao obter chats reais via getChats:', chatErr.message);
            const fallbackChats = await obterChatsFallback();
            return res.json({ connected: isConnected, error: chatErr.message, chats: fallbackChats });
        }

        const formatted = [];
        for (const c of (chats || [])) {
            if (!c || !c.id) continue;
            if (config.ignoreGroups && c.isGroup) continue;
            const serializedId = c.id._serialized || String(c.id);
            if (serializedId === 'status@broadcast') continue;

            let lastBody = '';
            try {
                if (c.lastMessage) {
                    lastBody = c.lastMessage.body || (c.lastMessage.hasMedia ? '[Mídia]' : '');
                }
            } catch (e) {}

            formatted.push({
                id: serializedId,
                name: c.name || c.formattedTitle || (c.id && c.id.user ? String(c.id.user) : 'Contato'),
                telefone: serializedId,
                unreadCount: c.unreadCount || 0,
                timestamp: c.timestamp || Math.floor(Date.now() / 1000),
                lastMessage: lastBody,
                isGroup: !!c.isGroup,
                isPinned: !!c.pinned
            });
        }

        formatted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        res.json({ connected: true, chats: formatted });
    } catch (err) {
        console.error('Erro ao buscar chats do WhatsApp:', err.message);
        const fallbackChats = await obterChatsFallback();
        res.json({ connected: false, error: err.message, chats: fallbackChats });
    }
});

app.get('/api/whatsapp/chat/:chatId/messages', async (req, res) => {
    const { chatId } = req.params;
    try {
        if (!client || !isConnected) {
            return res.json({ success: false, error: 'WhatsApp desconectado', messages: [] });
        }

        let chat = null;
        try {
            chat = await client.getChatById(chatId);
        } catch (e) {}

        if (!chat) return res.json({ success: false, error: 'Chat não encontrado', messages: [] });

        let msgs = [];
        try {
            msgs = await chat.fetchMessages({ limit: 40 });
        } catch (e) {
            console.warn(`[WhatsApp] Aviso ao buscar mensagens de ${chatId}:`, e.message);
        }

        const list = (msgs || []).map(m => ({
            id: m.id ? m.id._serialized : '',
            fromMe: !!m.fromMe,
            body: m.body || '',
            timestamp: m.timestamp || Math.floor(Date.now() / 1000),
            type: m.type || 'chat',
            hasMedia: !!m.hasMedia,
            from: m.from || '',
            to: m.to || ''
        }));

        try { await chat.sendSeen(); } catch (e) {}
        res.json({ success: true, messages: list });
    } catch (err) {
        res.json({ success: false, error: err.message, messages: [] });
    }
});

app.post('/api/whatsapp/chat/:chatId/send', async (req, res) => {
    const { chatId } = req.params;
    const { mensagem } = req.body;
    try {
        if (!client || !isConnected) {
            return res.status(503).json({ error: 'WhatsApp não está conectado' });
        }
        if (!mensagem || !mensagem.trim()) {
            return res.status(400).json({ error: 'Mensagem vazia' });
        }

        const sentMsg = await client.sendMessage(chatId, mensagem.trim());
        addLog('ENVIADA', chatId, mensagem.trim());

        res.json({
            success: true,
            message: {
                id: sentMsg.id._serialized,
                fromMe: true,
                body: sentMsg.body,
                timestamp: sentMsg.timestamp
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GRUPOS DO WHATSAPP (AVISOS & NOTIFICAÇÕES) ────────────────────────────────
app.get('/api/whatsapp/groups', async (req, res) => {
    try {
        if (!client || !isConnected) {
            return res.json({ connected: false, groups: [] });
        }
        let chats = [];
        try {
            chats = await Promise.race([
                client.getChats(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao buscar grupos')), 7000))
            ]);
        } catch (e) {
            console.warn('[WhatsApp] Aviso ao obter grupos:', e.message);
            return res.json({ connected: isConnected, error: e.message, groups: [] });
        }

        const groups = (chats || [])
            .filter(c => c && (c.isGroup || (c.id && String(c.id._serialized || c.id).endsWith('@g.us'))))
            .map(c => ({
                id: c.id ? (c.id._serialized || String(c.id)) : '',
                name: c.name || 'Grupo sem nome',
                unreadCount: c.unreadCount || 0,
                timestamp: c.timestamp || Math.floor(Date.now() / 1000)
            }));

        res.json({ connected: true, groups });
    } catch (err) {
        res.json({ connected: false, error: err.message, groups: [] });
    }
});

app.post('/api/whatsapp/group/send', async (req, res) => {
    const { groupId, mensagem } = req.body;
    try {
        if (!client || !isConnected) {
            return res.status(503).json({ success: false, error: 'WhatsApp não está conectado' });
        }
        if (!groupId || !mensagem || !mensagem.trim()) {
            return res.status(400).json({ success: false, error: 'Grupo ou mensagem não informados' });
        }

        const sentMsg = await dispararMensagemComDelays(groupId, mensagem.trim(), 2, true);
        res.json({
            success: true,
            message: {
                fromMe: true,
                body: mensagem.trim()
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── SISTEMA DE AGENDAMENTO DE MENSAGENS EM GRUPOS ─────────────────────────────
const AGENDAMENTOS_FILE = path.join(__dirname, 'agendamentos_grupos.json');

function carregarAgendamentosGrupos() {
    try {
        if (!fs.existsSync(AGENDAMENTOS_FILE)) return [];
        const raw = fs.readFileSync(AGENDAMENTOS_FILE, 'utf8');
        return JSON.parse(raw || '[]');
    } catch (e) {
        console.error('Erro ao ler agendamentos_grupos.json:', e.message);
        return [];
    }
}

function salvarAgendamentosGrupos(lista) {
    try {
        fs.writeFileSync(AGENDAMENTOS_FILE, JSON.stringify(lista, null, 2), 'utf8');
    } catch (e) {
        console.error('Erro ao salvar agendamentos_grupos.json:', e.message);
    }
}

// Helper universal de envio com suporte a delays, digitação e rastreamento de links/status
async function dispararMensagemComDelays(chatId, mensagem, delayDefault = 2, deveDigitar = true, options = {}) {
    let partes = [];
    const regex = /---delay(?::(\d+))?---/gi;
    let lastIndex = 0;
    let match;
    let delays = [];

    // Converte links normais em links rastreados caso seja mensagem para contato individual
    let msgProcessada = String(mensagem || '');
    if (chatId && !chatId.endsWith('@g.us')) {
        const telDest = chatId.replace('@c.us', '');
        msgProcessada = converterLinksEmRastreaveis(msgProcessada, telDest, options.passoId, options.reqHost, options.reqProtocol);
    }

    while ((match = regex.exec(msgProcessada)) !== null) {
        const textoAntes = msgProcessada.substring(lastIndex, match.index).trim();
        if (textoAntes) partes.push(textoAntes);
        const segs = match[1] ? parseInt(match[1], 10) : delayDefault;
        delays.push(segs);
        lastIndex = regex.lastIndex;
    }
    const textoFinal = msgProcessada.substring(lastIndex).trim();
    if (textoFinal) partes.push(textoFinal);

    if (partes.length === 0) {
        partes = [msgProcessada.trim()];
        delays = [delayDefault];
    }

    let chatObj = null;
    try {
        chatObj = await client.getChatById(chatId);
    } catch (e) {}

    for (let i = 0; i < partes.length; i++) {
        const trecho = partes[i];
        if (!trecho) continue;

        if (deveDigitar && chatObj) {
            try { await chatObj.sendStateTyping(); } catch (e) {}
        }

        const pausa = delays[i] || delayDefault;
        const tempoEsperaMs = Math.max(1000, pausa * 1000);
        await new Promise(resolve => setTimeout(resolve, tempoEsperaMs));

        if (chatObj) {
            try { await chatObj.clearState(); } catch (e) {}
        }

        const sentMsg = await client.sendMessage(chatId, trecho);

        // Registra ID da mensagem para rastrear entrega e leitura
        if (sentMsg && sentMsg.id && sentMsg.id._serialized) {
            const msgId = sentMsg.id._serialized;
            const dest = chatId.replace('@c.us', '').replace('@g.us', '');
            const tracking = carregarTracking();
            if (!tracking.mensagens) tracking.mensagens = {};
            tracking.mensagens[msgId] = {
                msgId,
                telefone: dest,
                passoId: options.passoId || null,
                ack: 1,
                ackNome: 'ENVIADA',
                dataEnvio: new Date().toLocaleString('pt-BR')
            };
            salvarTracking(tracking);
        }

        addLog(chatId.endsWith('@g.us') ? 'ENVIADA_GRUPO' : 'ENVIADA', chatId, trecho);
    }
}

// Agendador em segundo plano: verifica a cada 10 segundos
let isVerificandoAgendamentos = false;
async function verificarAgendamentosGrupos() {
    if (isVerificandoAgendamentos) return;
    if (!client || !isConnected) return;

    isVerificandoAgendamentos = true;
    try {
        const agendamentos = carregarAgendamentosGrupos();
        const agora = Date.now();
        let alterou = false;

        for (const item of agendamentos) {
            if (item.status === 'PENDENTE' && item.timestamp <= agora) {
                console.log(`[Agendador] ⏰ Disparando mensagem programada para grupo: ${item.groupName} (${item.groupId})`);
                item.status = 'ENVIANDO';
                salvarAgendamentosGrupos(agendamentos);

                try {
                    await dispararMensagemComDelays(item.groupId, item.mensagem, 2, true);
                    item.status = 'ENVIADO';
                    item.enviadoEm = new Date().toISOString();
                    item.erro = null;
                    console.log(`[Agendador] ✅ Mensagem enviada com sucesso para ${item.groupName}`);
                } catch (errEnvio) {
                    console.error(`[Agendador] ❌ Erro ao enviar para ${item.groupId}:`, errEnvio.message);
                    item.status = 'FALHA';
                    item.erro = errEnvio.message;
                }
                alterou = true;
            }
        }

        if (alterou) {
            salvarAgendamentosGrupos(agendamentos);
        }
    } catch (e) {
        console.error('[Agendador] Erro no loop de agendamentos:', e.message);
    } finally {
        isVerificandoAgendamentos = false;
    }
}
setInterval(verificarAgendamentosGrupos, 10000);

// Rotas de Agendamentos
app.get('/api/whatsapp/scheduled-groups', (req, res) => {
    try {
        const agendamentos = carregarAgendamentosGrupos();
        // Ordena: PENDENTES primeiro por data mais próxima, depois outros
        agendamentos.sort((a, b) => {
            if (a.status === 'PENDENTE' && b.status !== 'PENDENTE') return -1;
            if (a.status !== 'PENDENTE' && b.status === 'PENDENTE') return 1;
            if (a.status === 'PENDENTE' && b.status === 'PENDENTE') {
                return a.timestamp - b.timestamp;
            }
            return (b.timestamp || 0) - (a.timestamp || 0);
        });
        res.json({ success: true, schedules: agendamentos });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message, schedules: [] });
    }
});

app.post('/api/whatsapp/scheduled-groups', (req, res) => {
    try {
        const { groupId, groupName, dataHora, timestamp, mensagem } = req.body;
        if (!groupId || !mensagem || !mensagem.trim()) {
            return res.status(400).json({ success: false, error: 'Grupo e mensagem são obrigatórios.' });
        }
        if (!dataHora || !timestamp) {
            return res.status(400).json({ success: false, error: 'Data e horário de envio são obrigatórios.' });
        }

        const agendamentos = carregarAgendamentosGrupos();
        const novo = {
            id: 'agend_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            groupId: String(groupId).trim(),
            groupName: String(groupName || 'Grupo do WhatsApp').trim(),
            dataHora: String(dataHora),
            timestamp: Number(timestamp),
            mensagem: String(mensagem).trim(),
            status: 'PENDENTE',
            criadoEm: new Date().toISOString(),
            enviadoEm: null,
            erro: null
        };

        agendamentos.push(novo);
        salvarAgendamentosGrupos(agendamentos);

        res.json({ success: true, schedule: novo });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/whatsapp/scheduled-groups/:id', (req, res) => {
    try {
        const { id } = req.params;
        let agendamentos = carregarAgendamentosGrupos();
        const antes = agendamentos.length;
        agendamentos = agendamentos.filter(a => a.id !== id);
        if (agendamentos.length !== antes) {
            salvarAgendamentosGrupos(agendamentos);
            res.json({ success: true, message: 'Agendamento removido com sucesso.' });
        } else {
            res.status(404).json({ success: false, error: 'Agendamento não encontrado.' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/whatsapp/scheduled-groups/:id/send-now', async (req, res) => {
    try {
        const { id } = req.params;
        if (!client || !isConnected) {
            return res.status(503).json({ success: false, error: 'WhatsApp não está conectado no momento.' });
        }

        let agendamentos = carregarAgendamentosGrupos();
        const item = agendamentos.find(a => a.id === id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Agendamento não encontrado.' });
        }

        await dispararMensagemComDelays(item.groupId, item.mensagem, 2, true);
        item.status = 'ENVIADO';
        item.enviadoEm = new Date().toISOString();
        item.erro = null;
        salvarAgendamentosGrupos(agendamentos);

        res.json({ success: true, message: 'Mensagem enviada com sucesso para o grupo!' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── ENVIO COM DELAYS MANYCHAT, SIMULAÇÃO DE DIGITANDO & RASTREAMENTO ─────────
app.post('/send', async (req, res) => {
    let { telefone, mensagem, delay_segundos, simular_digitando, passo_id } = req.body;
    try {
        if (!client) {
            return res.status(500).send({ erro: 'Cliente não inicializado' });
        }
        if (!telefone) {
            return res.status(400).send({ erro: 'Telefone não informado' });
        }
        let chatId = String(telefone).trim();
        if (!chatId.includes('@')) {
            let digits = chatId.replace(/\D/g, '');
            if (digits.length === 10 || digits.length === 11) {
                digits = '55' + digits;
            }
            chatId = digits + '@c.us';
        }

        res.status(200).send({ status: 'Processando envio com delay/digitação e rastreamento' });

        const delayDefault = typeof delay_segundos === 'number' ? delay_segundos : 2;
        const deveDigitar = simular_digitando !== false;
        const options = {
            passoId: passo_id || null,
            reqHost: req.get('host'),
            reqProtocol: req.protocol
        };

        dispararMensagemComDelays(chatId, mensagem, delayDefault, deveDigitar, options).catch(errEnvio => {
            console.error(`Erro ao disparar mensagens para ${chatId}:`, errEnvio.message);
        });
    } catch (error) {
        console.error('Erro no /send:', error.message);
        if (!res.headersSent) {
            res.status(500).send({ erro: error.message });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 CENTRAL DE AUTOMAÇÃO HOTMART & CURSOS ONLINE`);
    console.log(`   Painel Web: http://localhost:${PORT}`);
    console.log(`===============================================`);
    criarClienteWhatsApp();
});
