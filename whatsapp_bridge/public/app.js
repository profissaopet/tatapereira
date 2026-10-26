let settingsCache = {};
let chatsWhatsAppCache = [];
let chatAtivoAtual = null;
let isWhatsAppConnected = false;

// ── NAVEGAÇÃO DE ABAS ─────────────────────────────────────────────────────────
function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    const tab = document.getElementById(tabId);
    const btn = document.getElementById('btn-' + tabId);

    if (tab) tab.classList.add('active');
    if (btn) btn.classList.add('active');

    if (tabId === 'tabHotmart') {
        carregarHotmartConfig();
        carregarHotmartStats();
        carregarCursosHotmart();
    } else if (tabId === 'tabRegua') {
        carregarHotmartConfig();
        carregarCursosHotmart();
    } else if (tabId === 'tabGrupos') {
        carregarGruposWhatsApp();
        carregarConfigAlertasGrupo();
        carregarAgendamentosGrupos();
    } else if (tabId === 'tabChat') {
        carregarChatsWhatsApp();
    } else if (tabId === 'tabConfiguracoes') {
        carregarHotmartConfig();
        carregarCatalogoCursos();
        atualizarStatus();
    } else if (tabId === 'tabEnquetes') {
        carregarGruposParaEnquete();
    } else if (tabId === 'tabAcessos') {
        carregarLogsAcesso();
    }
}

function escapeHtml(texto) {
    if (!texto) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
}

function inserirTextoNoTextarea(textareaId, texto) {
    const ta = document.getElementById(textareaId);
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const atual = ta.value;
    ta.value = atual.substring(0, start) + texto + atual.substring(end);
    ta.selectionStart = ta.selectionEnd = start + texto.length;
    ta.focus();
}

// ── ONBOARDING & HOMOLOGAÇÃO DO SISTEMA ─────────────────────────────────────────
function atualizarProgressoOnboarding() {
    const h = settingsCache.hotmart || {};

    // 1. WhatsApp Conectado?
    const p1 = isWhatsAppConnected;

    // 2. Dados do Treinamento preenchidos?
    const prodVal = (document.getElementById('onboardingProduto')?.value || h.produto_padrao || '').trim();
    const chkVal = (document.getElementById('onboardingLinkCheckout')?.value || h.link_checkout || '').trim();
    const p2 = !!(prodVal && chkVal && chkVal.startsWith('http'));

    // 3. Webhook Hotmart cadastrado?
    const p3 = localStorage.getItem('onboarding_passo3_webhook') === 'true';

    // 4. Teste prático enviado e aprovado?
    const p4 = localStorage.getItem('onboarding_passo4_testado') === 'true';

    // Atualiza Card Passo 1
    const badgeP1 = document.getElementById('badgePasso1');
    const cardP1 = document.getElementById('cardPasso1');
    const descP1 = document.getElementById('contentPasso1Desconectado');
    const connP1 = document.getElementById('contentPasso1Conectado');
    if (badgeP1) {
        badgeP1.className = p1 ? 'pill pill-green' : 'pill pill-amber';
        badgeP1.innerHTML = p1 ? '<i class="fa-solid fa-circle-check"></i> Conectado e Pronto' : '<i class="fa-solid fa-clock"></i> Pendente';
    }
    if (cardP1) cardP1.style.borderLeft = p1 ? '4px solid #16a34a' : '4px solid #f59e0b';
    if (descP1) descP1.classList.toggle('hidden', p1);
    if (connP1) connP1.classList.toggle('hidden', !p1);

    // Atualiza Card Passo 2
    const badgeP2 = document.getElementById('badgePasso2');
    const cardP2 = document.getElementById('cardPasso2');
    if (badgeP2) {
        badgeP2.className = p2 ? 'pill pill-green' : 'pill pill-amber';
        badgeP2.innerHTML = p2 ? '<i class="fa-solid fa-circle-check"></i> Dados Configurados' : '<i class="fa-solid fa-clock"></i> Pendente';
    }
    if (cardP2) cardP2.style.borderLeft = p2 ? '4px solid #16a34a' : '4px solid #f59e0b';

    // Atualiza Card Passo 3
    const badgeP3 = document.getElementById('badgePasso3');
    const cardP3 = document.getElementById('cardPasso3');
    const checkP3 = document.getElementById('checkOnboardingPasso3');
    if (badgeP3) {
        badgeP3.className = p3 ? 'pill pill-green' : 'pill pill-amber';
        badgeP3.innerHTML = p3 ? '<i class="fa-solid fa-circle-check"></i> Cadastrado na Hotmart' : '<i class="fa-solid fa-clock"></i> Pendente';
    }
    if (cardP3) cardP3.style.borderLeft = p3 ? '4px solid #16a34a' : '4px solid #f59e0b';
    if (checkP3) checkP3.checked = p3;

    // Atualiza Card Passo 4
    const badgeP4 = document.getElementById('badgePasso4');
    const cardP4 = document.getElementById('cardPasso4');
    if (badgeP4) {
        badgeP4.className = p4 ? 'pill pill-green' : 'pill pill-amber';
        badgeP4.innerHTML = p4 ? '<i class="fa-solid fa-circle-check"></i> Teste Aprovado & Homologado' : '<i class="fa-solid fa-clock"></i> Aguardando Teste';
    }
    if (cardP4) cardP4.style.borderLeft = p4 ? '4px solid #16a34a' : '4px solid #f59e0b';

    // Cálculo do Progresso Geral
    const total = (p1 ? 1 : 0) + (p2 ? 1 : 0) + (p3 ? 1 : 0) + (p4 ? 1 : 0);
    const pct = Math.round((total / 4) * 100);

    const txtProgresso = document.getElementById('onboardingProgressoTexto');
    const pctProgresso = document.getElementById('onboardingProgressoPct');
    const barProgresso = document.getElementById('onboardingProgressBar');
    const statusPill = document.getElementById('onboardingStatusPill');
    const badgeNav = document.getElementById('badgeOnboardingProgress');
    const bannerApto = document.getElementById('onboardingBannerApto');
    const badgeHeaderApto = document.getElementById('badgeHeaderApto');

    if (txtProgresso) txtProgresso.innerText = `Progresso de Ativação: ${total} de 4 passos concluídos`;
    if (pctProgresso) pctProgresso.innerText = `${pct}%`;
    if (barProgresso) barProgresso.style.width = `${pct}%`;

    const btnOnboarding = document.getElementById('btn-tabOnboarding');
    const tabOnboarding = document.getElementById('tabOnboarding');

    const jaConcluido = localStorage.getItem('onboarding_completo') === 'true';

    if (total === 4 || jaConcluido) {
        localStorage.setItem('onboarding_completo', 'true');

        if (statusPill) {
            statusPill.className = 'pill pill-green';
            statusPill.innerHTML = '<i class="fa-solid fa-shield-halved"></i> 100% APTO & OPERANDO';
        }
        if (badgeNav) {
            badgeNav.className = 'pill pill-green';
            badgeNav.innerText = '✓ Apto';
        }
        if (badgeHeaderApto) badgeHeaderApto.classList.remove('hidden');

        // Retira a aba de Onboarding da barra lateral
        if (btnOnboarding) btnOnboarding.classList.add('hidden');

        // Retira o card tutorial de Passo 1 do painel principal
        const cardSetup = document.getElementById('cardSetupHotmart');
        if (cardSetup) cardSetup.classList.add('hidden');
        const btnToggleWpp = document.getElementById('btnToggleWebhookHotmart');
        if (btnToggleWpp) btnToggleWpp.classList.remove('hidden');

        // Retira do painel: redireciona para a aba principal de vendas se ainda estiver no onboarding
        if (tabOnboarding && tabOnboarding.classList.contains('active')) {
            openTab('tabHotmart');
        }
    } else {
        localStorage.removeItem('onboarding_completo');
        if (btnOnboarding) btnOnboarding.classList.remove('hidden');
        if (badgeHeaderApto) badgeHeaderApto.classList.add('hidden');
        const cardSetup = document.getElementById('cardSetupHotmart');
        if (cardSetup) cardSetup.classList.remove('hidden');
        const btnToggleWpp = document.getElementById('btnToggleWebhookHotmart');
        if (btnToggleWpp) btnToggleWpp.classList.add('hidden');
        if (statusPill) {
            statusPill.className = 'pill pill-amber';
            statusPill.innerHTML = `<i class="fa-solid fa-list-check"></i> ${total}/4 Passos Concluídos`;
        }
        if (badgeNav) {
            badgeNav.className = 'pill pill-amber';
            badgeNav.innerText = `${total}/4`;
        }
        if (bannerApto) bannerApto.classList.add('hidden');
    }
}

function validarOnboardingPasso2Live() {
    atualizarProgressoOnboarding();
}

async function salvarDadosOnboardingPasso2() {
    const prod = document.getElementById('onboardingProduto')?.value.trim();
    const chk = document.getElementById('onboardingLinkCheckout')?.value.trim();
    const ace = document.getElementById('onboardingLinkAcesso')?.value.trim();

    if (!prod) return alert('Por favor, informe o nome do seu Curso / Treinamento!');
    if (!chk) return alert('Por favor, informe o link de pagamento (checkout)!');

    if (!settingsCache.hotmart) settingsCache.hotmart = {};
    settingsCache.hotmart.produto_padrao = prod;
    settingsCache.hotmart.link_checkout = chk;
    if (ace) settingsCache.hotmart.link_acesso = ace;

    setVal('hotmartProduto', prod);
    setVal('hotmartLinkCheckout', chk);
    setVal('hotmartLinkAcesso', ace);

    await salvarHotmartConfig();
    atualizarProgressoOnboarding();
    alert('✅ Dados do treinamento salvos com sucesso!');
}

async function solicitarPareamentoOnboarding() {
    const phone = document.getElementById('onboardingPairPhone')?.value.trim();
    if (!phone) return alert('Digite o número de telefone com DDD! Ex: 21989886602');

    const box = document.getElementById('onboardingPairCodeBox');
    if (!box) return;
    box.classList.remove('hidden');
    box.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#c2410c;">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Gerando código para <b>${escapeHtml(phone)}</b>... Aguarde alguns instantes.</span>
        </div>
    `;

    try {
        const res = await fetch('/api/pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await res.json();
        if (data.success && data.pairingCode) {
            localStorage.setItem('whatsapp_active_pairing_code', data.pairingCode);
            localStorage.setItem('whatsapp_pair_phone', phone);
            box.innerHTML = `
                <div style="font-size:12px;color:#15803d;font-weight:700;margin-bottom:6px;">
                    <i class="fa-solid fa-circle-check"></i> CÓDIGO GERADO! No seu celular:
                </div>
                <div style="font-size:11.5px;color:#166534;margin-bottom:8px;">
                    Abra o WhatsApp ➔ Aparelhos Conectados ➔ Conectar Aparelho ➔ <b>Conectar com número de telefone</b>:
                </div>
                <div style="font-size:26px;letter-spacing:6px;font-weight:900;color:#15803d;background:#ffffff;padding:8px 12px;border-radius:8px;border:2px dashed #86efac;text-align:center;">
                    ${data.pairingCode}
                </div>
            `;
        } else {
            box.innerHTML = `
                <div style="font-size:12px;color:#b91c1c;line-height:1.5;">
                    ⚠️ ${escapeHtml(data.error || 'Não foi possível gerar o código por número.')}<br><br>
                    <b>Alternativa recomendada:</b> Conecte diretamente pela câmera do celular com QR Code:
                    <div style="margin-top:8px;">
                        <a href="/qr" target="_blank" class="btn-primary" style="font-size:12px;padding:6px 14px;background:#16a34a;border-color:#16a34a;text-decoration:none;">
                            <i class="fa-solid fa-qrcode"></i> Abrir QR Code em Nova Aba
                        </a>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        box.innerHTML = `
            <div style="font-size:12px;color:#b91c1c;">
                Erro de conexão com o servidor ao gerar código.<br>
                <div style="margin-top:8px;">
                    <a href="/qr" target="_blank" class="btn-primary" style="font-size:12px;padding:6px 14px;background:#16a34a;border-color:#16a34a;text-decoration:none;">
                        <i class="fa-solid fa-qrcode"></i> Conectar com a Câmera (QR Code)
                    </a>
                </div>
            </div>
        `;
    }
}

async function solicitarPareamento() {
    const phone = document.getElementById('inputPairPhone')?.value.trim();
    if (!phone) return alert('Digite o número de telefone com DDD!');
    const box = document.getElementById('boxPairCode');
    if (!box) return;
    box.classList.remove('hidden');
    box.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando código de pareamento...';

    try {
        const res = await fetch('/api/pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await res.json();
        if (data.success && data.pairingCode) {
            localStorage.setItem('whatsapp_active_pairing_code', data.pairingCode);
            localStorage.setItem('whatsapp_pair_phone', phone);
            box.innerHTML = `<span style="font-size:13px;color:#15803d;font-weight:700;">Código:</span> <b style="letter-spacing:4px;font-size:24px;color:#15803d;margin-left:8px;">${data.pairingCode}</b>`;
        } else {
            box.innerHTML = `<span style="color:#b91c1c;font-size:12px;">${escapeHtml(data.error || 'Erro ao gerar código.')}</span>`;
        }
    } catch (e) {
        box.innerHTML = '<span style="color:#b91c1c;font-size:12px;">Erro de conexão. Tente pelo QR Code.</span>';
    }
}

function copiarWebhookUrlOnboarding() {
    const inp = document.getElementById('onboardingWebhookUrl');
    if (!inp) return;
    inp.select();
    navigator.clipboard.writeText(inp.value).then(() => {
        const btn = document.getElementById('btnCopiarWebhookOnboarding');
        if (btn) {
            const old = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Link Copiado!';
            setTimeout(() => { btn.innerHTML = old; }, 2000);
        }
    });
}

function toggleConfirmacaoPasso3(checked) {
    localStorage.setItem('onboarding_passo3_webhook', checked ? 'true' : 'false');
    atualizarProgressoOnboarding();
}

async function executarTesteOnboarding() {
    const tel = document.getElementById('onboardingTesteTelefone')?.value.trim();
    const evt = document.getElementById('onboardingTesteEvento')?.value || 'CARRINHO_ABANDONADO';
    const resBox = document.getElementById('onboardingTesteResultado');
    const btn = document.getElementById('btnDispararTesteOnboarding');

    if (!tel) {
        alert('Digite o seu número de WhatsApp com DDD para receber o teste!');
        return;
    }

    if (!isWhatsAppConnected) {
        alert('⚠️ Conecte seu WhatsApp no Passo 1 antes de disparar o teste!');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Disparando Teste...';
    }

    if (resBox) {
        resBox.classList.remove('hidden');
        resBox.innerHTML = `
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;font-size:12.5px;color:#9a3412;display:flex;align-items:center;gap:10px;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:16px;"></i>
                <span>Enviando mensagens com simulação de digitação e pausas naturais para <b>${escapeHtml(tel)}</b>... Olhe seu WhatsApp!</span>
            </div>
        `;
    }

    try {
        const res = await fetch('/api/hotmart/testar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telefone: tel,
                nome: 'Produtor(a) VIP',
                tipo_evento: evt
            })
        });

        const data = await res.json();
        if (data.status === 'success') {
            localStorage.setItem('onboarding_passo4_testado', 'true');
            localStorage.setItem('onboarding_telefone_teste', tel);
            localStorage.setItem('onboarding_completo', 'true');

            if (resBox) {
                resBox.innerHTML = `
                    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;font-size:13px;color:#15803d;display:flex;align-items:center;gap:12px;">
                        <i class="fa-solid fa-circle-check" style="font-size:22px;flex-shrink:0;"></i>
                        <div>
                            <b>✓ Teste Aprovado com Sucesso!</b><br>
                            A mensagem foi despachada para o WhatsApp <b>${escapeHtml(data.telefone || tel)}</b>. Seu sistema foi homologado e está <b>100% APTO</b>!<br>
                            <span style="font-size:11.5px;color:#166534;">Finalizando onboarding e abrindo seu Painel de Vendas em instantes...</span>
                        </div>
                    </div>
                `;
            }
            atualizarProgressoOnboarding();
            carregarHotmartStats();

            // Após 2.5s, retira o onboarding da barra lateral e vai para o painel principal
            setTimeout(() => {
                const btnOnb = document.getElementById('btn-tabOnboarding');
                if (btnOnb) btnOnb.classList.add('hidden');
                openTab('tabHotmart');
            }, 2500);
        } else {
            if (resBox) {
                resBox.innerHTML = `
                    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;font-size:12.5px;color:#b91c1c;">
                        ❌ Erro ao enviar teste: ${escapeHtml(data.message || JSON.stringify(data))}
                    </div>
                `;
            }
        }
    } catch (e) {
        if (resBox) {
            resBox.innerHTML = `
                <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;font-size:12.5px;color:#b91c1c;">
                    ❌ Falha na conexão com o servidor ao testar.
                </div>
            `;
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Disparar Teste de Validação';
        }
    }
}

function reabrirOnboarding() {
    const btnOnb = document.getElementById('btn-tabOnboarding');
    if (btnOnb) btnOnb.classList.remove('hidden');
    openTab('tabOnboarding');
}

function toggleSetupHotmart() {
    const card = document.getElementById('cardSetupHotmart');
    if (!card) return;
    card.classList.toggle('hidden');
    if (!card.classList.contains('hidden')) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ── STATUS WHATSAPP ───────────────────────────────────────────────────────────
async function atualizarStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();

        isWhatsAppConnected = !!data.isConnected;

        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        const toggleBot = document.getElementById('btnToggleBot');

        const cfgPill = document.getElementById('cfgStatusWppPill');
        const cfgBoxDesc = document.getElementById('cfgBoxWppDesconectado');
        const cfgBoxConn = document.getElementById('cfgBoxWppConectado');
        const cfgTxtConn = document.getElementById('cfgTextoWppConectado');

        if (data.isConnected) {
            localStorage.removeItem('whatsapp_active_pairing_code');
            dot.style.background = '#16a34a';
            text.innerText = 'WhatsApp Conectado';
            text.style.color = '#15803d';

            if (cfgPill) {
                cfgPill.className = 'pill pill-green';
                cfgPill.innerHTML = '<i class="fa-solid fa-circle-check"></i> Conectado e Ativo';
            }
            if (cfgBoxDesc) cfgBoxDesc.classList.add('hidden');
            if (cfgBoxConn) cfgBoxConn.classList.remove('hidden');
            if (cfgTxtConn && data.userPhoneNumber) {
                cfgTxtConn.innerText = `Conectado ao número: +${data.userPhoneNumber}`;
            }

            const boxCfgCode = document.getElementById('cfgBoxPairCode');
            if (boxCfgCode) boxCfgCode.classList.add('hidden');
        } else {
            dot.style.background = '#dc2626';
            text.innerText = 'WhatsApp Desconectado';
            text.style.color = '#dc2626';

            if (cfgPill) {
                cfgPill.className = 'pill pill-amber';
                cfgPill.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Desconectado';
            }
            if (cfgBoxDesc) cfgBoxDesc.classList.remove('hidden');
            if (cfgBoxConn) cfgBoxConn.classList.add('hidden');

            const activePairCode = data.pairingCode || localStorage.getItem('whatsapp_active_pairing_code');
            const activePhone = data.userPhoneNumber || localStorage.getItem('whatsapp_pair_phone');

            if (activePhone) {
                const inpCfg = document.getElementById('cfgInputPairPhone');
                if (inpCfg && !inpCfg.value) inpCfg.value = activePhone;
            }

            if (activePairCode) {
                renderizarCodigoPareamentoConfig(activePairCode);
            }
        }

        if (toggleBot && data.config) {
            toggleBot.checked = data.config.botEnabled !== false;
        }
    } catch (e) {}
}

async function alterarConfig() {
    const botEnabled = document.getElementById('btnToggleBot')?.checked ?? true;
    await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botEnabled })
    });
}

async function solicitarPareamento() {
    const phone = document.getElementById('inputPairPhone')?.value.trim();
    if (!phone) return alert('Digite o número de telefone com DDD!');

    const box = document.getElementById('boxPairCode');
    box.classList.remove('hidden');
    box.innerText = 'Gerando código de pareamento...';

    try {
        const res = await fetch('/api/pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await res.json();
        if (data.pairingCode) {
            box.innerText = `Código: ${data.pairingCode}`;
        } else {
            box.innerText = 'Falha ao obter código. Tente novamente ou use o QR Code.';
        }
    } catch (e) {
        box.innerText = 'Erro ao solicitar código.';
    }
}

// ── CONFIGURAÇÕES HOTMART ─────────────────────────────────────────────────────
async function carregarHotmartConfig() {
    try {
        const res = await fetch('/api/settings');
        settingsCache = await res.json();
        const h = settingsCache.hotmart || {};

        const toggle = document.getElementById('hotmartAtivo');
        if (toggle) toggle.checked = h.ativo !== false;

        const toggleRegua = document.getElementById('hotmartReguaAtiva');
        if (toggleRegua) toggleRegua.checked = h.regua_pos_venda?.ativo !== false;

        setVal('hotmartHottok', h.hottok || '');
        setVal('hotmartProduto', h.produto_padrao || 'Curso Online Completo');
        setVal('hotmartLinkCheckout', h.link_checkout || 'https://pay.hotmart.com/?src=wpp_automacao');
        setVal('hotmartLinkAcesso', h.link_acesso || 'https://app-vlc.hotmart.com/login');
        setVal('hotmartMsgAbandono', h.msg_abandono || '');
        setVal('hotmartMsgPix', h.msg_pix_boleto || '');
        setVal('hotmartMsgAprovado', h.msg_aprovado || '');
        setVal('hotmartMsgCancelado', h.msg_cancelado || '');
        setVal('hotmartMsgExpirado', h.msg_expirado || '');
        setVal('hotmartMsgReembolso', h.msg_reembolsado || '');

        // Sincroniza campos do Onboarding
        setVal('onboardingProduto', h.produto_padrao || '');
        setVal('onboardingLinkCheckout', h.link_checkout || '');
        setVal('onboardingLinkAcesso', h.link_acesso || '');

        const telSalvo = localStorage.getItem('onboarding_telefone_teste');
        if (telSalvo) setVal('onboardingTesteTelefone', telSalvo);

        const urlInput = document.getElementById('hotmartWebhookUrl');
        const onbUrlInput = document.getElementById('onboardingWebhookUrl');
        const protocol = window.location.protocol;
        const host = window.location.host;
        const webhookUrl = `${protocol}//${host}/webhook/hotmart`;
        if (urlInput) urlInput.value = webhookUrl;
        if (onbUrlInput) onbUrlInput.value = webhookUrl;

        renderReguaPosVenda();
        atualizarProgressoOnboarding();

        // Atualizar contagem no badge de acessos
        try {
            const resAcessos = await fetch('/api/hotmart/acessos');
            const listaAcessos = await resAcessos.json();
            const badge = document.getElementById('badgeAcessosTotal');
            if (badge) {
                badge.innerText = listaAcessos.length;
                badge.classList.toggle('hidden', listaAcessos.length === 0);
            }
        } catch (_) {}
    } catch (e) {
        console.error('Erro ao carregar settings:', e);
    }
}

async function salvarHotmartConfig() {
    if (!settingsCache.hotmart) settingsCache.hotmart = {};
    const h = settingsCache.hotmart;

    h.ativo = document.getElementById('hotmartAtivo')?.checked ?? true;
    h.hottok = document.getElementById('hotmartHottok')?.value.trim() || '';
    h.produto_padrao = document.getElementById('hotmartProduto')?.value.trim() || 'Curso Online Completo';
    h.link_checkout = document.getElementById('hotmartLinkCheckout')?.value.trim() || '';
    h.link_acesso = document.getElementById('hotmartLinkAcesso')?.value.trim() || '';
    h.msg_abandono = document.getElementById('hotmartMsgAbandono')?.value || '';
    h.msg_pix_boleto = document.getElementById('hotmartMsgPix')?.value || '';
    h.msg_aprovado = document.getElementById('hotmartMsgAprovado')?.value || '';
    h.msg_cancelado = document.getElementById('hotmartMsgCancelado')?.value || '';
    h.msg_expirado = document.getElementById('hotmartMsgExpirado')?.value || '';
    h.msg_reembolsado = document.getElementById('hotmartMsgReembolso')?.value || '';

    // Aviso de primeiro acesso e re-engajamento
    h.msg_aviso_acesso = document.getElementById('msgAvisoAcesso')?.value || '';
    h.msg_reengajamento = document.getElementById('msgReengajamento')?.value || '';
    h.dias_inatividade_reengajamento = parseInt(document.getElementById('diasInatividade')?.value, 10) || 3;

    if (!h.regua_pos_venda) h.regua_pos_venda = { ativo: true, mensagens: [] };
    h.regua_pos_venda.ativo = document.getElementById('hotmartReguaAtiva')?.checked ?? true;

    // Atualiza mensagens, dias, datas fixas, títulos, status e re-engajamento de cada passo
    (h.regua_pos_venda.mensagens || []).forEach(passo => {
        const msgEl = document.getElementById(`regua_msg_${passo.id}`);
        const atvEl = document.getElementById(`regua_ativo_${passo.id}`);
        const tipoEl = document.getElementById(`regua_tipo_${passo.id}`);
        const diasEl = document.getElementById(`regua_dias_${passo.id}`);
        const dataEl = document.getElementById(`regua_data_${passo.id}`);
        const horaEl = document.getElementById(`regua_hora_${passo.id}`);
        const titEl = document.getElementById(`regua_titulo_${passo.id}`);
        const cursoEl = document.getElementById(`regua_curso_${passo.id}`);

        // Re-engajamento individual
        const reengAtvEl = document.getElementById(`regua_reeng_ativo_${passo.id}`);
        const reengDiasEl = document.getElementById(`regua_reeng_dias_${passo.id}`);
        const reengMsgEl = document.getElementById(`regua_reeng_msg_${passo.id}`);

        if (msgEl) passo.mensagem = msgEl.value;
        if (atvEl) passo.ativo = atvEl.checked;
        if (tipoEl) passo.tipo_disparo = tipoEl.value;
        if (diasEl) passo.dias = parseInt(diasEl.value, 10) || 0;
        if (dataEl) passo.data_fixa = dataEl.value;
        if (horaEl) passo.hora_fixa = horaEl.value || '09:00';
        if (titEl) passo.titulo = titEl.value.trim();
        if (cursoEl) passo.filtro_produto = cursoEl.value;

        if (reengAtvEl) passo.reengajamento_ativo = reengAtvEl.checked;
        if (reengDiasEl) passo.reengajamento_dias = parseInt(reengDiasEl.value, 10) || 2;
        if (reengMsgEl) passo.reengajamento_msg = reengMsgEl.value;
    });

    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsCache)
        });
        alert('✅ Configurações e Mensagens Pós-Venda salvas com sucesso!');
        renderReguaPosVenda();
    } catch (e) {
        alert('Erro ao salvar configurações.');
    }
}

function copiarWebhookUrl() {
    const el = document.getElementById('hotmartWebhookUrl');
    if (!el) return;
    el.select();
    navigator.clipboard.writeText(el.value).then(() => {
        alert('📋 URL do Webhook copiada com sucesso!\n\nCole em Hotmart ➔ Ferramentas ➔ Webhook (Postback).');
    }).catch(() => {
        alert('Copie manualmente: ' + el.value);
    });
}

// ── RÉGUA DE PÓS-VENDA (MODALIDADES: DIAS APÓS COMPRA OU DATA FIXA) ─────────────
let filtroReguaAtual = 'todos';

function filtrarRegua(tipo) {
    filtroReguaAtual = tipo;
    ['todos', 'dias_apos_compra', 'data_fixa'].forEach(t => {
        const btn = document.getElementById(`btnFiltroRegua_${t}`);
        if (btn) {
            if (t === tipo) {
                btn.style.background = '#f1f5f9';
                btn.style.border = '1px solid var(--border)';
                btn.style.fontWeight = '700';
            } else {
                btn.style.background = 'transparent';
                btn.style.border = 'none';
                btn.style.fontWeight = '500';
            }
        }
    });
    renderReguaPosVenda();
}

function alternarTipoPassoRegua(passoId, novoTipo) {
    const boxDias = document.getElementById(`box_dias_${passoId}`);
    const boxData = document.getElementById(`box_data_${passoId}`);
    if (boxDias && boxData) {
        if (novoTipo === 'data_fixa') {
            boxDias.style.display = 'none';
            boxData.style.display = 'flex';
        } else {
            boxDias.style.display = 'flex';
            boxData.style.display = 'none';
        }
    }
    const msgs = settingsCache.hotmart?.regua_pos_venda?.mensagens || [];
    const p = msgs.find(m => m.id === passoId);
    if (p) p.tipo_disparo = novoTipo;
}

function selecionarModalidadeReguaModal(tipo) {
    const radioDias = document.getElementById('tipoDiasAposCompra');
    const radioData = document.getElementById('tipoDataFixa');
    const cardDias = document.getElementById('cardModalTipoDias');
    const cardData = document.getElementById('cardModalTipoData');
    const boxDias = document.getElementById('boxModalDias');
    const boxData = document.getElementById('boxModalData');

    if (tipo === 'data_fixa') {
        if (radioData) radioData.checked = true;
        if (cardData) {
            cardData.style.background = '#eff6ff';
            cardData.style.border = '2px solid #2563eb';
        }
        if (cardDias) {
            cardDias.style.background = '#f8fafc';
            cardDias.style.border = '1px solid var(--border)';
        }
        if (boxDias) boxDias.classList.add('hidden');
        if (boxData) boxData.classList.remove('hidden');
    } else {
        if (radioDias) radioDias.checked = true;
        if (cardDias) {
            cardDias.style.background = '#f5f3ff';
            cardDias.style.border = '2px solid #7c3aed';
        }
        if (cardData) {
            cardData.style.background = '#f8fafc';
            cardData.style.border = '1px solid var(--border)';
        }
        if (boxDias) boxDias.classList.remove('hidden');
        if (boxData) boxData.classList.add('hidden');
    }
}

function renderReguaPosVenda() {
    const container = document.getElementById('containerReguaPassos');
    if (!container) return;

    if (!settingsCache.hotmart) settingsCache.hotmart = {};
    if (!settingsCache.hotmart.regua_pos_venda) {
        settingsCache.hotmart.regua_pos_venda = { ativo: true, mensagens: [] };
    }
    const regua = settingsCache.hotmart.regua_pos_venda;
    const mensagens = regua.mensagens || [];

    const cnt = document.getElementById('contadorReguaPassos');
    if (cnt) cnt.innerText = `${mensagens.length} mensagem(ns) configurada(s)`;

    if (mensagens.length === 0) {
        container.innerHTML = `
            <div style="background:#f8fafc;border:2px dashed var(--border);border-radius:10px;padding:24px;text-align:center;">
                <i class="fa-solid fa-list-check" style="font-size:24px;color:#94a3b8;margin-bottom:8px;display:block;"></i>
                <div style="font-weight:700;font-size:13px;color:var(--text);">Nenhuma mensagem cadastrada na régua de pós-venda.</div>
                <div style="font-size:12px;color:var(--muted);margin-top:2px;">Clique no botão "+ Nova Mensagem de Pós-Venda" acima para criar o primeiro envio!</div>
            </div>
        `;
        return;
    }

    const filtradas = mensagens.filter(m => {
        if (filtroReguaAtual === 'dias_apos_compra') return m.tipo_disparo !== 'data_fixa';
        if (filtroReguaAtual === 'data_fixa') return m.tipo_disparo === 'data_fixa';
        return true;
    });

    if (filtradas.length === 0) {
        container.innerHTML = `
            <div style="background:#f8fafc;border:1px dashed var(--border);border-radius:10px;padding:20px;text-align:center;color:var(--muted);font-size:12.5px;">
                Nenhuma mensagem encontrada para o filtro selecionado.
            </div>
        `;
        return;
    }

    container.innerHTML = filtradas.map((passo, idx) => {
        const isAtivo = passo.ativo !== false;
        const isDataFixa = passo.tipo_disparo === 'data_fixa';
        const diasVal = (passo.dias !== undefined && passo.dias !== null) ? passo.dias : (idx + 1);
        const dataFixaVal = passo.data_fixa || '';
        const horaFixaVal = passo.hora_fixa || '09:00';

        const corBorda = isDataFixa ? '#2563eb' : '#7c3aed';
        const corFundoBadge = isDataFixa ? '#eff6ff' : '#f5f3ff';
        const corTextoBadge = isDataFixa ? '#1e40af' : '#6d28d9';

        return `
            <div style="background:#ffffff;border:1px solid ${isAtivo ? (isDataFixa ? '#bfdbfe' : '#ddd6fe') : 'var(--border)'};border-radius:10px;padding:14px;box-shadow:var(--shadow);border-left:4px solid ${isAtivo ? corBorda : '#cbd5e1'};">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:300px;flex-wrap:wrap;">
                        <!-- SELETOR INLINE DE MODALIDADE -->
                        <div style="display:flex;align-items:center;gap:6px;background:${corFundoBadge};border:1px solid ${isDataFixa ? '#93c5fd' : '#c4b5fd'};border-radius:6px;padding:3px 8px;">
                            <select id="regua_tipo_${passo.id}" onchange="alternarTipoPassoRegua('${passo.id}', this.value)" style="border:none;background:transparent;font-size:11.5px;font-weight:700;color:${corTextoBadge};cursor:pointer;outline:none;">
                                <option value="dias_apos_compra" ${!isDataFixa ? 'selected' : ''}>⏳ Dias após Compra</option>
                                <option value="data_fixa" ${isDataFixa ? 'selected' : ''}>📅 Em Dia Certo (Turma)</option>
                            </select>

                            <div id="box_dias_${passo.id}" style="${isDataFixa ? 'display:none;' : 'display:flex;align-items:center;gap:4px;'}">
                                <input type="number" id="regua_dias_${passo.id}" value="${diasVal}" min="0" step="1" 
                                    style="width:50px;padding:2px 4px;font-size:12px;font-weight:800;color:#6d28d9;text-align:center;border-radius:4px;border:1px solid #a78bfa;background:#ffffff;"
                                    title="Dias após a aprovação da compra para enviar">
                                <span style="font-size:11px;font-weight:700;color:#6d28d9;">dia(s)</span>
                            </div>

                            <div id="box_data_${passo.id}" style="${isDataFixa ? 'display:flex;align-items:center;gap:4px;' : 'display:none;'}">
                                <input type="date" id="regua_data_${passo.id}" value="${dataFixaVal}" 
                                    style="padding:2px 4px;font-size:11.5px;font-weight:700;color:#1e40af;border-radius:4px;border:1px solid #93c5fd;background:#ffffff;"
                                    title="Data de envio">
                                <input type="time" id="regua_hora_${passo.id}" value="${horaFixaVal}" 
                                    style="width:70px;padding:2px 4px;font-size:11.5px;font-weight:700;color:#1e40af;border-radius:4px;border:1px solid #93c5fd;background:#ffffff;"
                                    title="Horário de envio">
                            </div>
                        </div>

                        <input type="text" id="regua_titulo_${passo.id}" value="${escapeHtml(passo.titulo || ('Mensagem ' + (idx + 1)))}" 
                            placeholder="Título de identificação..."
                            style="flex:1;min-width:180px;padding:4px 8px;font-size:12.5px;font-weight:600;border-radius:6px;border:1px solid var(--border);">

                        <!-- FILTRO POR CURSO (MULTI-CURSOS) -->
                        <div style="display:flex;align-items:center;gap:4px;background:#f8fafc;border:1px solid var(--border);border-radius:6px;padding:3px 6px;">
                            <i class="fa-solid fa-graduation-cap" style="font-size:11px;color:#64748b;"></i>
                            <select id="regua_curso_${passo.id}" style="border:none;background:transparent;font-size:11px;font-weight:600;color:var(--text);cursor:pointer;outline:none;" title="Curso específico para este disparo">
                                <option value="TODOS" ${(!passo.filtro_produto || passo.filtro_produto === 'TODOS') ? 'selected' : ''}>🌐 Todos os Cursos</option>
                                ${(cursosCache || []).map(c => `<option value="${escapeHtml(c)}" ${passo.filtro_produto === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;">
                        <button type="button" onclick="testarPassoRegua('${passo.id}')" class="btn-ghost" style="font-size:11px;padding:4px 9px;border:1px solid ${isDataFixa ? '#bfdbfe' : '#c4b5fd'};color:${isDataFixa ? '#1e40af' : '#6d28d9'};background:${corFundoBadge};border-radius:6px;font-weight:600;" title="Enviar mensagem de teste para o WhatsApp">
                            <i class="fa-solid fa-paper-plane"></i> Testar
                        </button>
                        <label style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--text);cursor:pointer;margin:0;background:#f8fafc;padding:4px 8px;border-radius:6px;border:1px solid var(--border);">
                            <input type="checkbox" id="regua_ativo_${passo.id}" ${isAtivo ? 'checked' : ''} style="accent-color:${corBorda};">
                            <span style="font-weight:600;">Ativo</span>
                        </label>
                        <button type="button" onclick="removerPassoRegua('${passo.id}')" class="btn-ghost" style="font-size:11px;padding:4px 8px;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-weight:600;" title="Excluir este passo">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>

                <div class="editor-toolbar" style="margin-bottom:6px;">
                    <button type="button" class="var-chip" onclick="inserirTextoNoTextarea('regua_msg_${passo.id}', '{nome}')">+ {nome}</button>
                    <button type="button" class="var-chip" onclick="inserirTextoNoTextarea('regua_msg_${passo.id}', '{produto}')">+ {produto}</button>
                    <button type="button" class="var-chip" onclick="inserirTextoNoTextarea('regua_msg_${passo.id}', '{link_acesso}')">+ {link_acesso}</button>
                    <button type="button" class="delay-tag-chip" onclick="inserirTextoNoTextarea('regua_msg_${passo.id}', '\\n---delay:2---\\n')"><i class="fa-solid fa-clock"></i> + Pausa (2s)</button>
                </div>
                <textarea id="regua_msg_${passo.id}" rows="3">${escapeHtml(passo.mensagem || '')}</textarea>

                <!-- BLOCO DE RE-ENGAJAMENTO INDIVIDUAL DESTA MENSAGEM -->
                <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #e2e8f0;">
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;color:#1e40af;margin:0;">
                            <input type="checkbox" id="regua_reeng_ativo_${passo.id}" ${(passo.reengajamento_ativo || passo.reengajar) ? 'checked' : ''} 
                                onchange="const box = document.getElementById('box_reeng_${passo.id}'); const boxDias = document.getElementById('box_reeng_dias_${passo.id}'); if(box) box.style.display = this.checked ? 'block' : 'none'; if(boxDias) boxDias.style.display = this.checked ? 'flex' : 'none';"
                                style="accent-color:#2563eb;">
                            <span style="font-weight:700;"><i class="fa-solid fa-rotate-right"></i> Re-engajamento (Lembrete se não interagir)</span>
                        </label>

                        <div id="box_reeng_dias_${passo.id}" style="${(passo.reengajamento_ativo || passo.reengajar) ? 'display:flex;' : 'display:none;'}align-items:center;gap:5px;">
                            <span style="font-size:11.5px;color:var(--muted);">Disparar após:</span>
                            <input type="number" id="regua_reeng_dias_${passo.id}" value="${passo.reengajamento_dias || passo.reengajar_dias || 2}" min="1" max="30"
                                style="width:48px;padding:2px 4px;font-size:11.5px;font-weight:700;color:#1e40af;text-align:center;border-radius:4px;border:1px solid #93c5fd;background:#ffffff;">
                            <span style="font-size:11.5px;color:var(--muted);">dia(s) sem resposta</span>
                        </div>
                    </div>

                    <div id="box_reeng_${passo.id}" style="${(passo.reengajamento_ativo || passo.reengajar) ? 'display:block;' : 'display:none;'}margin-top:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
                        <div class="editor-toolbar" style="margin-bottom:6px;">
                            <button type="button" class="var-chip" onclick="inserirTextoNoTextarea('regua_reeng_msg_${passo.id}', '{nome}')">+ {nome}</button>
                            <button type="button" class="var-chip" onclick="inserirTextoNoTextarea('regua_reeng_msg_${passo.id}', '{produto}')">+ {produto}</button>
                            <button type="button" class="var-chip" onclick="inserirTextoNoTextarea('regua_reeng_msg_${passo.id}', '{link_acesso}')">+ {link_acesso}</button>
                            <button type="button" class="delay-tag-chip" onclick="inserirTextoNoTextarea('regua_reeng_msg_${passo.id}', '\\n---delay:2---\\n')"><i class="fa-solid fa-clock"></i> + Pausa</button>
                        </div>
                        <textarea id="regua_reeng_msg_${passo.id}" rows="2" placeholder="Mensagem de re-engajamento para quem não responder ou não clicar...">${escapeHtml(passo.reengajamento_msg || passo.reengajar_msg || '')}</textarea>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function abrirModalNovoPassoRegua() {
    const modal = document.getElementById('modalNovoPassoRegua');
    if (modal) {
        modal.classList.remove('hidden');
        selecionarModalidadeReguaModal('dias_apos_compra');

        const msgs = settingsCache.hotmart?.regua_pos_venda?.mensagens || [];
        const maiorDia = msgs.reduce((max, m) => Math.max(max, parseInt(m.dias, 10) || 0), 0);
        const proximoDia = maiorDia + 2;

        const diasInp = document.getElementById('novoPassoDias');
        const titInp = document.getElementById('novoPassoTitulo');
        const msgInp = document.getElementById('novoPassoMensagem');
        const dataFixaInp = document.getElementById('novoPassoDataFixa');
        const horaFixaInp = document.getElementById('novoPassoHoraFixa');
        const titDataInp = document.getElementById('novoPassoTituloData');

        if (diasInp) diasInp.value = proximoDia;
        if (titInp) titInp.value = `Dia ${proximoDia} - Acompanhamento / Conteúdo Bônus`;
        if (msgInp) msgInp.value = `Oi {nome}, tudo bem? Passando para saber como estão seus estudos no curso *{produto}*!\n\n---delay:2---\nSe tiver qualquer dúvida sobre as aulas, me dá um toque aqui que estou à disposição! 🚀`;

        // Sugere amanhã para data fixa
        const d = new Date();
        d.setDate(d.getDate() + 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        if (dataFixaInp) dataFixaInp.value = `${yyyy}-${mm}-${dd}`;
        if (horaFixaInp) horaFixaInp.value = '09:00';
        if (titDataInp) titDataInp.value = 'Aula Inaugural Ao Vivo da Turma';
    }
}

function fecharModalNovoPassoRegua() {
    const modal = document.getElementById('modalNovoPassoRegua');
    if (modal) modal.classList.add('hidden');
}

function confirmarCriacaoNovoPassoRegua() {
    const isDataFixa = document.getElementById('tipoDataFixa')?.checked;
    const mensagem = document.getElementById('novoPassoMensagem')?.value.trim();

    if (!mensagem) return alert('Escreva a mensagem que será enviada no WhatsApp.');

    if (!settingsCache.hotmart) settingsCache.hotmart = {};
    if (!settingsCache.hotmart.regua_pos_venda) {
        settingsCache.hotmart.regua_pos_venda = { ativo: true, mensagens: [] };
    }

    const cursoFiltro = (document.getElementById('novoPassoCursoInput')?.value.trim()) || (document.getElementById('novoPassoCursoSelect')?.value) || 'TODOS';

    const reengAtivo = document.getElementById('novoPassoReengajarAtivo')?.checked || false;
    const reengDias = parseInt(document.getElementById('novoPassoReengajarDias')?.value, 10) || 2;
    const reengMsg = document.getElementById('novoPassoReengajarMsg')?.value || '';

    if (isDataFixa) {
        const dataFixa = document.getElementById('novoPassoDataFixa')?.value;
        const horaFixa = document.getElementById('novoPassoHoraFixa')?.value || '09:00';
        const titulo = document.getElementById('novoPassoTituloData')?.value.trim() || 'Aviso da Turma';

        if (!dataFixa) return alert('Selecione a data em que a mensagem será disparada.');

        const novoId = `data_${dataFixa.replace(/-/g, '')}_${Date.now().toString().slice(-4)}`;
        settingsCache.hotmart.regua_pos_venda.mensagens.push({
            id: novoId,
            tipo_disparo: 'data_fixa',
            data_fixa: dataFixa,
            hora_fixa: horaFixa,
            titulo: titulo,
            filtro_produto: cursoFiltro,
            ativo: true,
            mensagem: mensagem,
            reengajamento_ativo: reengAtivo,
            reengajamento_dias: reengDias,
            reengajamento_msg: reengMsg
        });
    } else {
        const dias = parseInt(document.getElementById('novoPassoDias')?.value, 10);
        const titulo = document.getElementById('novoPassoTitulo')?.value.trim() || `Dia ${dias} - Pós-Venda`;

        if (isNaN(dias) || dias < 0) return alert('Informe uma quantidade válida de dias.');

        const novoId = `dia_${dias}_${Date.now().toString().slice(-4)}`;
        settingsCache.hotmart.regua_pos_venda.mensagens.push({
            id: novoId,
            tipo_disparo: 'dias_apos_compra',
            dias: dias,
            titulo: titulo,
            filtro_produto: cursoFiltro,
            ativo: true,
            mensagem: mensagem,
            reengajamento_ativo: reengAtivo,
            reengajamento_dias: reengDias,
            reengajamento_msg: reengMsg
        });
    }

    fecharModalNovoPassoRegua();
    renderReguaPosVenda();
    alert('🎉 Mensagem adicionada com sucesso! Clique no botão "Salvar Alterações" no topo do painel para confirmar.');
}

function removerPassoRegua(passoId) {
    if (!confirm('Deseja realmente excluir esta mensagem da régua de pós-venda?')) return;
    if (!settingsCache.hotmart || !settingsCache.hotmart.regua_pos_venda) return;
    const msgs = settingsCache.hotmart.regua_pos_venda.mensagens || [];
    settingsCache.hotmart.regua_pos_venda.mensagens = msgs.filter(m => m.id !== passoId);
    renderReguaPosVenda();
}

async function executarVerificacaoReguaAgora() {
    try {
        const res = await fetch('/api/hotmart/regua/verificar_agora', { method: 'POST' });
        const data = await res.json();
        alert(`🚀 Verificação concluída!\n\n${data.processados} aluno(s) avaliado(s).\n${data.mensagens_enviadas} mensagem(ns) enviada(s) nesta rodada.`);
        carregarHotmartStats();
    } catch (e) {
        alert('Erro ao executar verificação da régua pós-venda.');
    }
}

async function testarPassoRegua(passoId) {
    const tel = prompt('Digite o número do WhatsApp (com DDD) para receber este passo em teste:', '21989886602');
    if (!tel) return;

    try {
        const res = await fetch('/api/hotmart/regua/testar_passo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone: tel, nome: 'Aluno Teste', passo_id: passoId })
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert(`✅ Mensagem do passo "${passoId}" disparada com sucesso para ${data.telefone} no WhatsApp!`);
        } else {
            alert('Falha ao disparar teste: ' + (data.erro || 'Erro'));
        }
    } catch (e) {
        alert('Erro ao testar passo da régua.');
    }
}

// ── ESTATÍSTICAS E TABELA HOTMART ─────────────────────────────────────────────
async function carregarHotmartStats() {
    try {
        const res = await fetch('/api/hotmart/stats');
        const data = await res.json();

        const abEl = document.getElementById('hotmartStatAbandonos');
        const bolEl = document.getElementById('hotmartStatBoletos');
        const alEl = document.getElementById('hotmartStatAlunos');
        const recEl = document.getElementById('hotmartStatRecusados');
        const expEl = document.getElementById('hotmartStatExpirados');
        const reembEl = document.getElementById('hotmartStatReembolsos');
        const badgeTotal = document.getElementById('badgeHotmartTotal');

        if (abEl) abEl.innerText = data.carrinhos_abandonados || 0;
        if (bolEl) bolEl.innerText = data.boletos_pix_gerados || 0;
        if (alEl) alEl.innerText = data.alunos_matriculados || 0;
        if (recEl) recEl.innerText = data.cartoes_recusados || 0;
        if (expEl) expEl.innerText = data.pagamentos_expirados || 0;
        if (reembEl) reembEl.innerText = data.reembolsos || 0;

        const total = data.total_hotmart || 0;
        if (badgeTotal) {
            badgeTotal.innerText = total;
            badgeTotal.classList.toggle('hidden', total === 0);
        }

        const tbody = document.getElementById('listaLeadsHotmart');
        if (tbody) {
            const leads = data.leads_recentes || [];
            if (leads.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align:center;padding:24px;color:var(--muted);">
                            Nenhum evento registrado ainda. Conecte o Webhook ou use o botão <b>"Simular Disparo"</b> acima para testar!
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = leads.slice().reverse().map(l => {
                let badgeClass = 'pill-blue';
                const st = l.status || '';
                if (st.includes('Aluno') || st.includes('Aprovad')) badgeClass = 'pill-green';
                else if (st.includes('Boleto') || st.includes('Pix')) badgeClass = 'pill-amber';
                else if (st.includes('Abandonado')) badgeClass = 'pill-purple';
                else if (st.includes('Recusado') || st.includes('Cancelad')) badgeClass = 'pill-amber';
                else if (st.includes('Expirado')) badgeClass = 'pill-purple';
                else if (st.includes('Reembols') || st.includes('Chargeback')) badgeClass = 'pill-red';

                const reguaEnviados = l.regua_enviados || [];
                let reguaBadges = '<span style="color:var(--muted);font-size:11px;">--</span>';
                if (l.regua_desativada || st.includes('Reembols') || st.includes('Chargeback')) {
                    reguaBadges = '<span class="pill" style="background:#fee2e2;color:#b91c1c;font-size:9.5px;padding:1px 5px;">Cancelada ✕</span>';
                } else if (st.includes('Aluno') || st.includes('Aprovad')) {
                    if (reguaEnviados.length > 0) {
                        reguaBadges = reguaEnviados.map(r => `<span class="pill pill-purple" style="font-size:9.5px;padding:1px 5px;margin-right:2px;">${r.toUpperCase()} ✓</span>`).join('');
                    } else {
                        reguaBadges = '<span class="pill pill-blue" style="font-size:9.5px;padding:1px 5px;">Iniciando</span>';
                    }
                }

                return `
                    <tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:10px 14px;font-weight:700;">${escapeHtml(l.nome || 'Não informado')}</td>
                        <td style="padding:10px 14px;font-family:monospace;font-size:12px;">${escapeHtml(l.telefone || '')}</td>
                        <td style="padding:10px 14px;color:var(--muted);">${escapeHtml(l.tipo_servico || 'Curso Online')}</td>
                        <td style="padding:10px 14px;"><span class="pill ${badgeClass}">${escapeHtml(l.status || 'Registrado')}</span></td>
                        <td style="padding:10px 14px;">${reguaBadges}</td>
                        <td style="padding:10px 14px;font-size:11.5px;color:var(--muted);">${escapeHtml(l.data_evento || '--')}</td>
                        <td style="padding:10px 14px;text-align:right;">
                            <button type="button" onclick="iniciarChatComContato('${l.telefone}')" class="btn-ghost" style="color:#16a34a;background:#f0fdf4;border-color:#bbf7d0;">
                                <i class="fa-brands fa-whatsapp"></i> Conversar
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (e) {}
}

function abrirModalTesteHotmart() {
    const modal = document.getElementById('modalTesteHotmart');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalTesteHotmart() {
    const modal = document.getElementById('modalTesteHotmart');
    if (modal) modal.classList.add('hidden');
}

async function executarTesteSimulacaoHotmart() {
    const telefone = document.getElementById('testeHotmartTelefone')?.value.trim();
    const nome = document.getElementById('testeHotmartNome')?.value.trim() || 'Juan Sales';
    const tipo = document.getElementById('testeHotmartEvento')?.value || 'CARRINHO_ABANDONADO';

    if (!telefone) return alert('Informe o número de telefone com DDD para receber o teste!');

    try {
        const res = await fetch('/api/hotmart/testar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone, nome, tipo_evento: tipo })
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert(`🎉 Teste enviado com sucesso!\n\nDisparo simulado com pausas ManyChat para ${data.nome} (${data.telefone}).`);
            fecharModalTesteHotmart();
            carregarHotmartStats();
        } else {
            alert('Falha ao processar simulação: ' + JSON.stringify(data));
        }
    } catch (e) {
        alert('Erro ao enviar teste.');
    }
}

async function limparDadosTeste() {
    if (!confirm('⚠️ Tem certeza que deseja apagar todos os dados de teste e histórico de leads?\n\nOs contadores serão zerados para que você comece com o painel 100% limpo para vendas reais.')) {
        return;
    }

    try {
        const res = await fetch('/api/leads/limpar', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'success') {
            localStorage.removeItem('onboarding_passo4_testado');
            localStorage.removeItem('onboarding_completo');
            alert('✅ Todos os dados de teste foram apagados com sucesso! O painel está zerado e pronto para vendas reais.');
            await carregarHotmartStats();
            await carregarChatsWhatsApp();
            atualizarProgressoOnboarding();
        } else {
            alert('Erro ao limpar dados: ' + (data.error || 'Falha no servidor'));
        }
    } catch (e) {
        alert('Erro ao comunicar com o servidor.');
    }
}

function iniciarChatComContato(telefone) {
    if (!telefone) return;
    openTab('tabChat');
    setTimeout(() => {
        const inp = document.getElementById('waSearchInput');
        if (inp) {
            inp.value = telefone.replace(/\D/g, '');
            filtrarChatsWhatsApp();
        }
    }, 400);
}

// ── ATENDIMENTO WHATSAPP WEB ──────────────────────────────────────────────────
async function carregarChatsWhatsApp() {
    try {
        const [resChats, resLeads] = await Promise.all([
            fetch('/api/whatsapp/chats').then(r => r.json()).catch(() => ({ chats: [] })),
            fetch('/api/leads').then(r => r.json()).catch(() => ([]))
        ]);

        const leads = resLeads || [];
        chatsWhatsAppCache = (resChats.chats || []).map(c => {
            const telLimpo = c.telefone ? c.telefone.replace('@c.us', '').replace('@lid', '') : '';
            const lead = leads.find(l => {
                const leadTel = l.telefone ? l.telefone.replace('@c.us', '').replace('@lid', '') : '';
                return leadTel && (leadTel === telLimpo || c.telefone.includes(leadTel));
            }) || null;

            return { ...c, lead };
        });

        renderListaChats();
    } catch (e) {}
}

function renderListaChats() {
    const container = document.getElementById('waChatList');
    if (!container) return;

    if (chatsWhatsAppCache.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:12px;">Nenhuma conversa encontrada.</div>';
        return;
    }

    container.innerHTML = chatsWhatsAppCache.map(c => {
        const isActive = chatAtivoAtual && chatAtivoAtual.id === c.id;
        const nomeFormatado = escapeHtml(c.name || (c.telefone ? String(c.telefone).replace('@c.us', '') : 'Contato'));
        const iniciais = (nomeFormatado || 'WA').slice(0, 2).toUpperCase();
        return `
            <div onclick="selecionarChat('${c.id}')" style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;background:${isActive ? '#fff7ed' : '#ffffff'};display:flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;border-radius:50%;background:#fed7aa;color:#c2410c;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:13px;">
                    ${iniciais}
                </div>
                <div style="flex:1;overflow:hidden;">
                    <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nomeFormatado}</div>
                    <div style="font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(c.lastMessage || 'Conversa iniciada')}</div>
                </div>
            </div>
        `;
    }).join('');
}

function filtrarChatsWhatsApp() {
    const termo = document.getElementById('waSearchInput')?.value.trim().toLowerCase() || '';
    if (!termo) {
        renderListaChats();
        return;
    }
    const filtrados = chatsWhatsAppCache.filter(c => (c.name || '').toLowerCase().includes(termo) || (c.telefone || '').includes(termo));
    const container = document.getElementById('waChatList');
    if (container) {
        container.innerHTML = filtrados.map(c => `
            <div onclick="selecionarChat('${c.id}')" style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;background:#ffffff;">
                <div style="font-weight:700;font-size:13px;">${escapeHtml(c.name || c.telefone)}</div>
                <div style="font-size:11.5px;color:var(--muted);">${escapeHtml(c.lastMessage || '')}</div>
            </div>
        `).join('');
    }
}

async function selecionarChat(chatId) {
    const chat = chatsWhatsAppCache.find(c => c.id === chatId);
    if (!chat) return;
    chatAtivoAtual = chat;

    document.getElementById('activeChatName').innerText = chat.name || chat.telefone.replace('@c.us', '');
    renderListaChats();
    renderFichaAluno(chat.lead);

    await carregarMensagensChatAtivo();
}

function renderFichaAluno(lead) {
    const content = document.getElementById('waLeadDetailsContent');
    if (!content) return;

    if (!lead) {
        content.innerHTML = `
            <div style="text-align:center;padding:16px 0;color:var(--muted);">
                Contato sem cadastro prévio de aluno.
            </div>
        `;
        return;
    }

    const reguaEnviados = lead.regua_enviados || [];
    const reguaBadges = reguaEnviados.length > 0 
        ? reguaEnviados.map(r => `<span class="pill pill-purple" style="margin-right:2px;">${r.toUpperCase()} ✓</span>`).join('')
        : '<span class="pill pill-blue">Iniciando régua</span>';

    // Rastreamento de Leitura e Cliques
    const rast = lead.rastreamento || {};
    const foiLida = lead.ultima_mensagem_lida || !!rast.ultima_leitura;
    const clicou = lead.clicou_no_link || (rast.links_clicados && rast.links_clicados.length > 0);
    const totalCliques = (rast.links_clicados || []).length;

    content.innerHTML = `
        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:10px;">
            <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;">Aluno</div>
            <div style="font-size:13px;font-weight:800;color:var(--text);margin-top:2px;">${escapeHtml(lead.nome || 'Não informado')}</div>
        </div>

        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:10px;">
            <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;">Treinamento</div>
            <div style="font-size:12px;font-weight:700;color:var(--text);margin-top:2px;">${escapeHtml(lead.tipo_servico || 'Curso Online')}</div>
        </div>

        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:10px;">
            <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;">Status Hotmart</div>
            <div style="margin-top:4px;"><span class="pill pill-green">${escapeHtml(lead.status || 'Registrado')}</span></div>
        </div>

        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:10px;">
            <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;">Régua Pós-Venda</div>
            <div style="margin-top:4px;">${reguaBadges}</div>
        </div>

        <!-- 📊 RASTREAMENTO INTELIGENTE (LEITURA & CLIQUES) -->
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;">
            <div style="font-size:10px;font-weight:700;color:#166534;text-transform:uppercase;display:flex;align-items:center;gap:5px;">
                <i class="fa-solid fa-chart-line"></i> Rastreamento de Mensagem
            </div>
            <div style="margin-top:6px;display:flex;flex-direction:column;gap:5px;font-size:11.5px;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <span style="color:#475569;">Leitura no WPP:</span>
                    ${foiLida 
                        ? `<span class="pill pill-blue" style="font-size:10px;padding:1px 6px;"><i class="fa-solid fa-check-double"></i> Visualizada</span>`
                        : `<span style="color:var(--muted);font-size:10.5px;">Não visualizada</span>`}
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <span style="color:#475569;">Clique nos Links:</span>
                    ${clicou 
                        ? `<span class="pill pill-green" style="font-size:10px;padding:1px 6px;"><i class="fa-solid fa-arrow-pointer"></i> Clicou (${totalCliques || 1}x)</span>`
                        : `<span style="color:var(--muted);font-size:10.5px;">Nenhum clique</span>`}
                </div>
                ${lead.ultimo_clique_data ? `<div style="font-size:10px;color:#166534;margin-top:2px;">Último clique: ${lead.ultimo_clique_data}</div>` : ''}
            </div>
        </div>
    `;
}

async function carregarMensagensChatAtivo() {
    if (!chatAtivoAtual) return;
    const container = document.getElementById('waMessagesContainer');

    try {
        const res = await fetch(`/api/whatsapp/chat/${encodeURIComponent(chatAtivoAtual.id)}/messages`);
        const data = await res.json();
        const msgs = data.messages || [];

        if (msgs.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;margin:auto;">Início da conversa com este contato.</div>';
            return;
        }

        container.innerHTML = msgs.map(m => {
            const isOut = m.fromMe === true;
            let ackBadge = '';
            if (isOut) {
                if (m.ack === 3) {
                    ackBadge = '<span title="Lida pelo contato (tiques azuis)" style="color:#0284c7;font-size:11px;font-weight:800;margin-left:5px;">✓✓</span>';
                } else if (m.ack === 2) {
                    ackBadge = '<span title="Entregue no celular" style="color:#94a3b8;font-size:11px;font-weight:800;margin-left:5px;">✓✓</span>';
                } else if (m.ack === 1) {
                    ackBadge = '<span title="Enviada" style="color:#94a3b8;font-size:11px;font-weight:800;margin-left:5px;">✓</span>';
                } else {
                    ackBadge = '<span title="Pendente" style="color:#94a3b8;font-size:9.5px;margin-left:4px;">🕒</span>';
                }
            }

            const horaFormatada = m.timestamp ? new Date(m.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

            return `
                <div style="display:flex;justify-content:${isOut ? 'flex-end' : 'flex-start'};margin-bottom:4px;">
                    <div style="max-width:70%;padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.4;background:${isOut ? '#fff7ed' : '#ffffff'};color:var(--text);border:1px solid ${isOut ? '#fed7aa' : 'var(--border)'};box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                        <div>${escapeHtml(m.body || '')}</div>
                        <div style="font-size:10px;color:var(--muted);text-align:right;margin-top:3px;display:flex;align-items:center;justify-content:flex-end;">
                            <span>${horaFormatada}</span>
                            ${ackBadge}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        container.scrollTop = container.scrollHeight;
    } catch (e) {}
}

async function enviarMensagemWhatsApp() {
    if (!chatAtivoAtual) return;
    const inp = document.getElementById('waMessageInput');
    const texto = inp ? inp.value.trim() : '';
    if (!texto) return;

    inp.value = '';
    try {
        await fetch(`/api/whatsapp/chat/${encodeURIComponent(chatAtivoAtual.id)}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mensagem: texto })
        });
        setTimeout(carregarMensagensChatAtivo, 500);
    } catch (e) {
        alert('Erro ao enviar mensagem.');
    }
}

function handleInputKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        enviarMensagemWhatsApp();
    }
}

async function alternarBotChatAtual() {
    if (!chatAtivoAtual) return;
    const tel = chatAtivoAtual.telefone;
    const btn = document.getElementById('btnToggleChatBot');
    const pausar = btn.innerText.includes('Pausar');
    const endpoint = pausar ? '/api/pausar_bot' : '/api/voltar_bot';

    try {
        await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone: tel })
        });
        btn.innerHTML = pausar ? '<i class="fa-solid fa-play"></i> Reativar Robô' : '<i class="fa-solid fa-pause"></i> Pausar Robô';
        alert(pausar ? 'Robô pausado para esta conversa. Atendimento manual assumido.' : 'Robô reativado para esta conversa.');
    } catch (e) {}
}

// ── IA CONSULTORA DE VENDAS ───────────────────────────────────────────────────
async function carregarConfigIA() {
    try {
        const [modRes, cfgRes] = await Promise.all([
            fetch('/api/ia/modelos').then(r => r.json()).catch(() => ({ online: false, modelos: [] })),
            fetch('/api/ia/config').then(r => r.json()).catch(() => ({}))
        ]);

        setVal('iaPrompt', cfgRes.prompt_ia || '');
        setVal('iaUrl', cfgRes.ia_url || 'http://host.docker.internal:11434');
        const iaAtivaEl = document.getElementById('iaAtiva');
        if (iaAtivaEl) iaAtivaEl.checked = cfgRes.ia_ativa !== false;

        const sel = document.getElementById('iaModelo');
        if (sel && modRes.modelos?.length > 0) {
            sel.innerHTML = modRes.modelos.map(m => `<option value="${m}" ${m === cfgRes.ia_modelo ? 'selected' : ''}>${m}</option>`).join('');
        }
    } catch (e) {}
}

async function salvarConfigIA() {
    const payload = {
        ia_ativa: document.getElementById('iaAtiva')?.checked ?? true,
        ia_modelo: document.getElementById('iaModelo')?.value || 'llama3',
        ia_url: document.getElementById('iaUrl')?.value.trim() || 'http://host.docker.internal:11434',
        prompt_ia: document.getElementById('iaPrompt')?.value.trim() || ''
    };
    try {
        await fetch('/api/ia/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        alert('✅ Configurações da IA salvas com sucesso!');
    } catch (e) {
        alert('Erro ao salvar IA.');
    }
}

async function testarIA() {
    const out = document.getElementById('iaTestOutput');
    if (!out) return;
    out.innerText = '⏳ Consultando Ollama...';
    try {
        const res = await fetch('/api/ia/testar', { method: 'POST' });
        const data = await res.json();
        out.innerText = data.success ? '🤖 Resposta da IA:\n\n' + data.resposta : '❌ ' + data.resposta;
    } catch (e) {
        out.innerText = 'Erro ao comunicar com Ollama.';
    }
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const savedPairPhone = localStorage.getItem('whatsapp_pair_phone');
    if (savedPairPhone) {
        const inpCfg = document.getElementById('cfgInputPairPhone');
        if (inpCfg) inpCfg.value = savedPairPhone;
    }
    atualizarStatus();
    carregarHotmartConfig();
    carregarHotmartStats();
    carregarCatalogoCursos();
    carregarCursosHotmart();
    setInterval(atualizarStatus, 3000);
    setInterval(carregarHotmartStats, 15000);
    setInterval(carregarChatsWhatsApp, 12000);
});

// ── CURSOS HOTMART & DISPARO SEGMENTADO (FÓRUM / AVISOS) ──────────────────────
let cursosCache = [];

async function carregarCursosHotmart() {
    try {
        const res = await fetch('/api/hotmart/cursos');
        const data = await res.json();
        cursosCache = data.cursos || [];

        // Atualiza selects
        const sNovo = document.getElementById('novoPassoCursoSelect');
        const sCom = document.getElementById('comunicadoCursoSelect');

        const optionsHtml = '<option value="TODOS">🌐 Todos os Cursos / Alunos Ativos</option>' + 
            cursosCache.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

        if (sNovo) sNovo.innerHTML = optionsHtml;
        if (sCom) sCom.innerHTML = optionsHtml;
    } catch (e) {
        console.warn('Erro ao carregar lista de cursos:', e);
    }
}

function selecionarCursoNoModal(val) {
    const inp = document.getElementById('novoPassoCursoInput');
    if (inp && val !== 'TODOS') {
        inp.value = val;
    } else if (inp && val === 'TODOS') {
        inp.value = '';
    }
}

function abrirModalComunicadoCurso() {
    carregarCursosHotmart();
    const modal = document.getElementById('modalComunicadoCurso');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalComunicadoCurso() {
    const modal = document.getElementById('modalComunicadoCurso');
    if (modal) modal.classList.add('hidden');
}

async function enviarComunicadoParaAlunosDoCurso() {
    const curso = document.getElementById('comunicadoCursoSelect')?.value || 'TODOS';
    const msg = document.getElementById('comunicadoCursoTexto')?.value.trim();
    const btn = document.getElementById('btnDispararComunicadoCurso');

    if (!msg) {
        return alert('Por favor, digite a mensagem do comunicado antes de disparar.');
    }

    const confTxt = curso === 'TODOS' 
        ? 'Deseja disparar este comunicado para TODOS os alunos ativos de todos os cursos?' 
        : `Deseja disparar este comunicado para os alunos ativos do curso "${curso}"?`;

    if (!confirm(confTxt)) return;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Disparando...';
    }

    try {
        const res = await fetch('/api/hotmart/disparo_curso', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ curso: curso, mensagem: msg })
        });
        const data = await res.json();

        if (data.status === 'success') {
            alert(`📢 ${data.message}\n\nO robô está enviando as mensagens no WhatsApp com intervalos seguros anti-bloqueio.`);
            fecharModalComunicadoCurso();
        } else if (data.status === 'warning') {
            alert(`⚠️ ${data.message}`);
        } else {
            alert(`Erro ao iniciar disparo: ${data.erro || 'Erro desconhecido'}`);
        }
    } catch (e) {
        alert('Erro ao conectar com o servidor para disparo do comunicado: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Disparar Comunicado Agora';
        }
    }
}

// ── GRUPOS DO WHATSAPP (ALERTAS DE EQUIPE & COMUNICADOS) ──────────────────────
let gruposWhatsAppCache = [];

async function carregarGruposWhatsApp() {
    const sAlertas = document.getElementById('selectGrupoAlertas');
    const sDisparo = document.getElementById('selectGrupoDisparo');
    const sAgend = document.getElementById('selectGrupoAgendamento');

    if (sAlertas) sAlertas.innerHTML = '<option value="">Carregando grupos do WhatsApp...</option>';
    if (sDisparo) sDisparo.innerHTML = '<option value="">Carregando grupos do WhatsApp...</option>';
    if (sAgend) sAgend.innerHTML = '<option value="">Carregando grupos do WhatsApp...</option>';

    try {
        const res = await fetch('/api/whatsapp/groups');
        const data = await res.json();
        gruposWhatsAppCache = data.groups || [];

        if (gruposWhatsAppCache.length === 0) {
            const vazio = '<option value="">Nenhum grupo encontrado (conecte o WhatsApp ou entre em um grupo)</option>';
            if (sAlertas) sAlertas.innerHTML = vazio;
            if (sDisparo) sDisparo.innerHTML = vazio;
            if (sAgend) sAgend.innerHTML = vazio;
            return;
        }

        const options = '<option value="">-- Selecione um Grupo do WhatsApp --</option>' +
            gruposWhatsAppCache.map(g => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join('');

        if (sAlertas) sAlertas.innerHTML = options;
        if (sDisparo) sDisparo.innerHTML = options;
        if (sAgend) sAgend.innerHTML = options;

        carregarConfigAlertasGrupo();
    } catch (e) {
        console.warn('Erro ao carregar grupos:', e);
        const errOpt = '<option value="">Erro ao carregar grupos do WhatsApp</option>';
        if (sAlertas) sAlertas.innerHTML = errOpt;
        if (sDisparo) sDisparo.innerHTML = errOpt;
        if (sAgend) sAgend.innerHTML = errOpt;
    }
}

function carregarConfigAlertasGrupo() {
    const h = settingsCache.hotmart || {};
    const chkAtivo = document.getElementById('grupoAlertasAtivo');
    const selGrupo = document.getElementById('selectGrupoAlertas');
    const chkVenda = document.getElementById('chkAlertaVenda');
    const chkAbandono = document.getElementById('chkAlertaAbandono');
    const chkPix = document.getElementById('chkAlertaPix');
    const chkRecusado = document.getElementById('chkAlertaRecusado');

    if (chkAtivo) chkAtivo.checked = !!h.grupo_alertas_ativo;
    if (selGrupo && h.grupo_alertas_id) selGrupo.value = h.grupo_alertas_id;

    const eventos = h.grupo_alertas_eventos || ["COMPRA_APROVADA", "CARRINHO_ABANDONADO", "PIX_BOLETO_GERADO", "CARTAO_RECUSADO"];
    if (chkVenda) chkVenda.checked = eventos.includes("COMPRA_APROVADA");
    if (chkAbandono) chkAbandono.checked = eventos.includes("CARRINHO_ABANDONADO");
    if (chkPix) chkPix.checked = eventos.includes("PIX_BOLETO_GERADO");
    if (chkRecusado) chkRecusado.checked = eventos.includes("CARTAO_RECUSADO");
}

async function salvarConfigAlertasGrupo() {
    if (!settingsCache.hotmart) settingsCache.hotmart = {};
    const h = settingsCache.hotmart;

    h.grupo_alertas_ativo = document.getElementById('grupoAlertasAtivo')?.checked ?? false;
    h.grupo_alertas_id = document.getElementById('selectGrupoAlertas')?.value || '';

    const evts = [];
    if (document.getElementById('chkAlertaVenda')?.checked) evts.push("COMPRA_APROVADA");
    if (document.getElementById('chkAlertaAbandono')?.checked) evts.push("CARRINHO_ABANDONADO");
    if (document.getElementById('chkAlertaPix')?.checked) evts.push("PIX_BOLETO_GERADO");
    if (document.getElementById('chkAlertaRecusado')?.checked) evts.push("CARTAO_RECUSADO");
    h.grupo_alertas_eventos = evts;

    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsCache)
        });
        alert('✅ Configurações de Alertas no Grupo salvas com sucesso!');
    } catch (e) {
        alert('Erro ao salvar alertas no grupo.');
    }
}

async function testarEnvioAlertaGrupo() {
    const grupoId = document.getElementById('selectGrupoAlertas')?.value;
    if (!grupoId) {
        return alert('Selecione um grupo da lista acima para realizar o envio de teste.');
    }

    try {
        const res = await fetch('/api/hotmart/testar_grupo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grupo_id: grupoId, tipo_evento: 'COMPRA_APROVADA' })
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert('🎉 Mensagem de teste enviada para o grupo com sucesso! Verifique o WhatsApp.');
        } else {
            alert(`Erro no envio: ${data.erro || 'Falha desconhecida'}`);
        }
    } catch (e) {
        alert('Erro ao conectar com servidor: ' + e.message);
    }
}

async function dispararComunicadoGrupo() {
    const grupoId = document.getElementById('selectGrupoDisparo')?.value;
    const msg = document.getElementById('msgComunicadoGrupo')?.value.trim();
    const btn = document.getElementById('btnDispararGrupo');

    if (!grupoId) return alert('Selecione o grupo de alunos de destino.');
    if (!msg) return alert('Digite a mensagem do comunicado a ser enviada no grupo.');

    if (!confirm('Deseja realmente disparar este comunicado para o grupo selecionado agora?')) return;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';
    }

    try {
        const res = await fetch('/api/whatsapp/group/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: grupoId, mensagem: msg })
        });
        const data = await res.json();
        if (data.success) {
            alert('🚀 Comunicado enviado com sucesso para o grupo!');
            document.getElementById('msgComunicadoGrupo').value = '';
        } else {
            alert(`Erro ao enviar: ${data.error || 'Falha no envio'}`);
        }
    } catch (e) {
        alert('Erro ao enviar para o grupo: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Disparar Comunicado no Grupo Agora';
        }
    }
}

// ── CATÁLOGO MULTI-CURSOS & CONFIGURAÇÕES ────────────────────────────────────
let catalogoCursosCache = {};
let cursoEmEdicaoNome = null;

async function carregarCatalogoCursos() {
    const tbody = document.getElementById('listaCursosCatalogo');
    if (!tbody) return;

    try {
        const res = await fetch('/api/hotmart/cursos');
        const data = await res.json();
        catalogoCursosCache = data.detalhes || {};

        const chaves = Object.keys(catalogoCursosCache);
        if (chaves.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center;padding:24px;color:var(--muted);">
                        Nenhum curso cadastrado ainda. Clique em <b>+ Novo Curso</b> acima para adicionar seu primeiro treinamento!
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = chaves.map(nome => {
            const item = catalogoCursosCache[nome] || {};
            const chk = item.link_checkout || '';
            const ace = item.link_acesso || '';
            const origem = item.origem || 'cadastrado';

            let origemBadge = '<span class="pill pill-green">Salvo</span>';
            if (origem === 'hotmart') {
                origemBadge = '<span class="pill pill-blue" title="Identificado automaticamente de leads/vendas da Hotmart">Detectado Hotmart</span>';
            } else if (origem === 'padrao') {
                origemBadge = '<span class="pill pill-slate">Padrão</span>';
            }

            const chkHtml = chk 
                ? `<a href="${escapeHtml(chk)}" target="_blank" style="color:#2563eb;text-decoration:none;display:inline-flex;align-items:center;gap:4px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px;"></i> ${escapeHtml(chk)}
                   </a>`
                : '<span style="color:var(--muted);font-style:italic;">(Usa link padrão)</span>';

            const aceHtml = ace 
                ? `<a href="${escapeHtml(ace)}" target="_blank" style="color:#7c3aed;text-decoration:none;display:inline-flex;align-items:center;gap:4px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px;"></i> ${escapeHtml(ace)}
                   </a>`
                : '<span style="color:var(--muted);font-style:italic;">(Usa link padrão)</span>';

            const isPadrao = origem === 'padrao';

            return `
                <tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:10px 12px;font-weight:700;color:var(--text);">
                        <i class="fa-solid fa-graduation-cap" style="color:#2563eb;margin-right:6px;"></i> ${escapeHtml(nome)}
                    </td>
                    <td style="padding:10px 12px;">${chkHtml}</td>
                    <td style="padding:10px 12px;">${aceHtml}</td>
                    <td style="padding:10px 12px;text-align:center;">${origemBadge}</td>
                    <td style="padding:10px 12px;text-align:right;white-space:nowrap;">
                        <button type="button" onclick="editarCursoModal('${escapeHtml(nome)}')" class="btn-ghost" style="padding:4px 8px;font-size:11px;" title="Editar links deste curso">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                        ${!isPadrao ? `
                        <button type="button" onclick="excluirCursoCatalogo('${escapeHtml(nome)}')" class="btn-ghost" style="padding:4px 8px;font-size:11px;color:#dc2626;margin-left:4px;" title="Remover curso">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.warn('Erro ao carregar catálogo de cursos:', e);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;padding:16px;color:#dc2626;">
                    Erro ao carregar lista de cursos.
                </td>
            </tr>
        `;
    }
}

function abrirModalCurso(nome) {
    const modal = document.getElementById('modalNovoCurso');
    if (!modal) return;

    cursoEmEdicaoNome = nome || null;
    const tit = document.getElementById('modalCursoTitulo');
    const inpNome = document.getElementById('modalCursoNome');
    const inpChk = document.getElementById('modalCursoCheckout');
    const inpAce = document.getElementById('modalCursoAcesso');

    if (nome && catalogoCursosCache[nome]) {
        const item = catalogoCursosCache[nome];
        if (tit) tit.innerText = `Editar Curso: ${nome}`;
        if (inpNome) {
            inpNome.value = nome;
            inpNome.disabled = (item.origem === 'padrao');
        }
        if (inpChk) inpChk.value = item.link_checkout || '';
        if (inpAce) inpAce.value = item.link_acesso || '';
    } else {
        if (tit) tit.innerText = 'Adicionar Curso no Catálogo';
        if (inpNome) {
            inpNome.value = '';
            inpNome.disabled = false;
        }
        if (inpChk) inpChk.value = '';
        if (inpAce) inpAce.value = '';
    }

    modal.classList.remove('hidden');
    if (inpNome && !inpNome.disabled) inpNome.focus();
}

function editarCursoModal(nome) {
    abrirModalCurso(nome);
}

function fecharModalCurso() {
    const modal = document.getElementById('modalNovoCurso');
    if (modal) modal.classList.add('hidden');
    cursoEmEdicaoNome = null;
}

async function confirmarSalvarCursoModal() {
    const inpNome = document.getElementById('modalCursoNome');
    const inpChk = document.getElementById('modalCursoCheckout');
    const inpAce = document.getElementById('modalCursoAcesso');
    const btn = document.getElementById('btnSalvarCursoModal');

    const nome = inpNome ? inpNome.value.trim() : '';
    const linkChk = inpChk ? inpChk.value.trim() : '';
    const linkAce = inpAce ? inpAce.value.trim() : '';

    if (!nome) {
        alert('Por favor, informe o nome do curso (exatamente como aparece na Hotmart).');
        if (inpNome) inpNome.focus();
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        const res = await fetch('/api/hotmart/cursos/salvar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome: nome,
                link_checkout: linkChk,
                link_acesso: linkAce
            })
        });
        const data = await res.json();

        if (data.status === 'success') {
            fecharModalCurso();
            await carregarCatalogoCursos();
            await carregarCursosHotmart();
        } else {
            alert(`Erro ao salvar curso: ${data.erro || 'Falha no servidor'}`);
        }
    } catch (e) {
        alert('Erro ao conectar com o servidor: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar Curso';
        }
    }
}

async function excluirCursoCatalogo(nome) {
    if (!confirm(`Deseja realmente remover o curso "${nome}" do catálogo?\n\nOs envios futuros deste curso passarão a usar os links padrão da conta.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/hotmart/cursos/${encodeURIComponent(nome)}`, {
            method: 'DELETE'
        });
        const data = await res.json();

        if (data.status === 'success') {
            await carregarCatalogoCursos();
            await carregarCursosHotmart();
        } else {
            alert(`Erro ao remover curso: ${data.erro || 'Falha'}`);
        }
    } catch (e) {
        alert('Erro ao remover curso: ' + e.message);
    }
}

async function solicitarPareamentoConfig() {
    const phone = document.getElementById('cfgInputPairPhone')?.value.trim();
    if (!phone) return alert('Digite o número de telefone do WhatsApp com DDD! Ex: 21989886602');

    const box = document.getElementById('cfgBoxPairCode');
    if (!box) return;

    box.classList.remove('hidden');
    box.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:#c2410c;">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Gerando código para <b>${escapeHtml(phone)}</b>... Aguarde alguns instantes.</span>
        </div>
    `;

    try {
        const res = await fetch('/api/pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await res.json();

        if (data.success && data.pairingCode) {
            localStorage.setItem('whatsapp_active_pairing_code', data.pairingCode);
            localStorage.setItem('whatsapp_pair_phone', phone);
            renderCodigoPareamentoNaBox(box, data.pairingCode);
        } else {
            box.innerHTML = `
                <div style="font-size:12px;color:#b91c1c;line-height:1.5;">
                    ⚠️ ${escapeHtml(data.error || 'Não foi possível gerar o código por número.')}<br><br>
                    <b>Alternativa recomendada:</b> Conecte diretamente pela câmera do celular com QR Code:
                    <div style="margin-top:8px;">
                        <a href="/qr" target="_blank" class="btn-primary" style="font-size:12px;padding:6px 14px;background:#16a34a;border-color:#16a34a;text-decoration:none;">
                            <i class="fa-solid fa-qrcode"></i> Abrir QR Code em Nova Aba
                        </a>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        box.innerHTML = `
            <div style="font-size:12px;color:#b91c1c;">
                Erro de conexão com o servidor ao gerar código.<br>
                <div style="margin-top:8px;">
                    <a href="/qr" target="_blank" class="btn-primary" style="font-size:12px;padding:6px 14px;background:#16a34a;border-color:#16a34a;text-decoration:none;">
                        <i class="fa-solid fa-qrcode"></i> Conectar com a Câmera (QR Code)
                    </a>
                </div>
            </div>
        `;
    }
}

function renderizarCodigoPareamentoConfig(code) {
    const box = document.getElementById('cfgBoxPairCode');
    if (!box || !code) return;
    box.classList.remove('hidden');
    renderCodigoPareamentoNaBox(box, code);
}

function renderCodigoPareamentoNaBox(box, code) {
    box.innerHTML = `
        <div style="font-size:12.5px;color:#15803d;font-weight:700;margin-bottom:6px;">
            <i class="fa-solid fa-circle-check"></i> CÓDIGO GERADO! No seu celular:
        </div>
        <div style="font-size:12px;color:#166534;margin-bottom:10px;">
            Abra o WhatsApp ➔ Aparelhos Conectados ➔ Conectar Aparelho ➔ <b>Conectar com número de telefone</b>:
        </div>
        <div style="font-size:26px;letter-spacing:6px;font-weight:900;color:#15803d;background:#ffffff;padding:10px 16px;border-radius:8px;border:2px dashed #86efac;display:inline-block;">
            ${escapeHtml(code)}
        </div>
    `;
}

// ── PROGRAMAÇÃO DE MENSAGENS EM GRUPOS (DATA & HORA) ──────────────────────────
function definirHorarioRapido(tipo) {
    const input = document.getElementById('inputAgendamentoDataHora');
    if (!input) return;

    const agora = new Date();
    let alvo = new Date(agora);

    if (tipo === 'em1hora') {
        alvo.setHours(alvo.getHours() + 1);
    } else if (tipo === 'hoje1930') {
        alvo.setHours(19, 30, 0, 0);
        if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
    } else if (tipo === 'hoje2000') {
        alvo.setHours(20, 0, 0, 0);
        if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
    } else if (tipo === 'amanha0900') {
        alvo.setDate(alvo.getDate() + 1);
        alvo.setHours(9, 0, 0, 0);
    } else if (tipo === 'amanha1930') {
        alvo.setDate(alvo.getDate() + 1);
        alvo.setHours(19, 30, 0, 0);
    }

    const ano = alvo.getFullYear();
    const mes = String(alvo.getMonth() + 1).padStart(2, '0');
    const dia = String(alvo.getDate()).padStart(2, '0');
    const horas = String(alvo.getHours()).padStart(2, '0');
    const mins = String(alvo.getMinutes()).padStart(2, '0');

    input.value = `${ano}-${mes}-${dia}T${horas}:${mins}`;
}

async function programarMensagemGrupo() {
    const selGrupo = document.getElementById('selectGrupoAgendamento');
    const inpDataHora = document.getElementById('inputAgendamentoDataHora');
    const inpMsg = document.getElementById('inputAgendamentoMensagem');
    const btn = document.getElementById('btnAgendarGrupo');

    const groupId = selGrupo?.value;
    const groupName = selGrupo?.options[selGrupo.selectedIndex]?.text || '';
    const dataHoraStr = inpDataHora?.value;
    const msg = inpMsg?.value.trim();

    if (!groupId) return alert('Por favor, selecione o grupo de destino.');
    if (!dataHoraStr) return alert('Por favor, defina a data e horário para o envio.');
    if (!msg) return alert('Por favor, digite a mensagem a ser enviada no grupo.');

    const targetDate = new Date(dataHoraStr);
    const timestamp = targetDate.getTime();
    if (isNaN(timestamp)) {
        return alert('Data e horário inválidos. Por favor, verifique o campo.');
    }

    if (timestamp <= Date.now()) {
        const conf = confirm('O horário escolhido já passou ou é agora! Deseja enviar imediatamente?');
        if (!conf) return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Agendando...';
    }

    try {
        const res = await fetch('/api/whatsapp/scheduled-groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                groupId,
                groupName,
                dataHora: dataHoraStr,
                timestamp,
                mensagem: msg
            })
        });
        const data = await res.json();

        if (data.success) {
            alert(`✅ Mensagem agendada com sucesso!\n\nGrupo: ${groupName}\nProgramada para: ${formatarDataHoraAmigavel(targetDate)}`);
            if (inpMsg) inpMsg.value = '';
            if (inpDataHora) inpDataHora.value = '';
            await carregarAgendamentosGrupos();
        } else {
            alert(`Erro ao programar: ${data.error || 'Falha desconhecida'}`);
        }
    } catch (e) {
        alert('Erro ao conectar com o servidor: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-calendar-check"></i> Agendar Envio no Grupo';
        }
    }
}

async function carregarAgendamentosGrupos() {
    const container = document.getElementById('containerAgendamentosGrupos');
    const badge = document.getElementById('badgeQtdAgendamentos');
    if (!container) return;

    try {
        const res = await fetch('/api/whatsapp/scheduled-groups');
        const data = await res.json();
        const lista = data.schedules || [];

        if (badge) {
            const pendentes = lista.filter(i => i.status === 'PENDENTE').length;
            badge.innerText = `${pendentes} pendente(s) / ${lista.length} total`;
            badge.className = pendentes > 0 ? 'pill pill-purple' : 'pill pill-muted';
        }

        if (lista.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:32px 16px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;margin-top:4px;">
                    <i class="fa-solid fa-calendar-xmark" style="font-size:32px;color:#94a3b8;margin-bottom:10px;display:block;"></i>
                    <span style="font-weight:700;font-size:14px;color:var(--text);display:block;margin-bottom:4px;">Nenhuma mensagem programada no momento</span>
                    <span style="font-size:12px;color:var(--muted);display:block;">Utilize o formulário acima para programar comunicados com dia e horário exatos.</span>
                </div>
            `;
            return;
        }

        let html = `
            <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px;">
                <thead>
                    <tr style="background:#f8fafc;border-bottom:2px solid var(--border);text-align:left;color:var(--muted);font-size:11px;font-weight:700;">
                        <th style="padding:10px 12px;">GRUPO DE DESTINO</th>
                        <th style="padding:10px 12px;">DATA / HORA PROGRAMADA</th>
                        <th style="padding:10px 12px;">MENSAGEM</th>
                        <th style="padding:10px 12px;text-align:center;">STATUS</th>
                        <th style="padding:10px 12px;text-align:right;">AÇÕES</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const agora = Date.now();

        lista.forEach(item => {
            const dataProg = new Date(item.timestamp || item.dataHora);
            const dataProgFormatada = isNaN(dataProg.getTime()) ? item.dataHora : formatarDataHoraAmigavel(dataProg);

            let statusBadge = '';
            if (item.status === 'PENDENTE') {
                const diffMs = (item.timestamp || 0) - agora;
                let tempoStr = '';
                if (diffMs > 0) {
                    const diffMin = Math.round(diffMs / 60000);
                    if (diffMin < 60) tempoStr = ` (em ${diffMin} min)`;
                    else {
                        const diffH = Math.floor(diffMin / 60);
                        tempoStr = ` (em ~${diffH}h)`;
                    }
                } else {
                    tempoStr = ' (enviando em instantes...)';
                }
                statusBadge = `<span class="pill pill-purple" style="font-weight:700;"><i class="fa-solid fa-clock"></i> Pendente${tempoStr}</span>`;
            } else if (item.status === 'ENVIADO') {
                const horaEnvio = item.enviadoEm ? new Date(item.enviadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                statusBadge = `<span class="pill pill-green" style="font-weight:700;" title="${item.enviadoEm || ''}"><i class="fa-solid fa-circle-check"></i> Enviada${horaEnvio ? ' às ' + horaEnvio : ''}</span>`;
            } else if (item.status === 'ENVIANDO') {
                statusBadge = `<span class="pill pill-orange" style="font-weight:700;"><i class="fa-solid fa-spinner fa-spin"></i> Disparando...</span>`;
            } else if (item.status === 'FALHA') {
                statusBadge = `<span class="pill pill-red" style="font-weight:700;" title="${escapeHtml(item.erro || '')}"><i class="fa-solid fa-triangle-exclamation"></i> Falha</span>`;
            } else {
                statusBadge = `<span class="pill pill-muted">${escapeHtml(item.status)}</span>`;
            }

            const msgResumo = escapeHtml(item.mensagem).replace(/\n/g, ' ');
            const msgCurta = msgResumo.length > 70 ? msgResumo.substring(0, 70) + '...' : msgResumo;

            html += `
                <tr style="border-bottom:1px solid var(--border);transition:background 0.15s;" onmouseover="this.style.background='#fdf8ff'" onmouseout="this.style.background='transparent'">
                    <td style="padding:10px 12px;font-weight:700;color:var(--text);">
                        <i class="fa-solid fa-users" style="color:#7c3aed;margin-right:6px;"></i>
                        ${escapeHtml(item.groupName || item.groupId)}
                    </td>
                    <td style="padding:10px 12px;color:var(--text);white-space:nowrap;">
                        <i class="fa-regular fa-calendar" style="color:var(--muted);margin-right:4px;"></i>
                        ${dataProgFormatada}
                    </td>
                    <td style="padding:10px 12px;color:var(--muted);font-size:12px;max-width:320px;" title="${escapeHtml(item.mensagem)}">
                        "${msgCurta}"
                    </td>
                    <td style="padding:10px 12px;text-align:center;white-space:nowrap;">
                        ${statusBadge}
                    </td>
                    <td style="padding:10px 12px;text-align:right;white-space:nowrap;">
                        <div style="display:inline-flex;gap:6px;">
                            ${item.status === 'PENDENTE' ? `
                                <button type="button" onclick="dispararAgendamentoAgora('${item.id}')" class="btn-ghost" title="Disparar no grupo agora sem esperar o horário" style="font-size:11.5px;padding:4px 8px;color:#16a34a;background:#dcfce7;border-color:#bbf7d0;font-weight:700;">
                                    <i class="fa-solid fa-paper-plane"></i> Enviar Agora
                                </button>
                            ` : ''}
                            <button type="button" onclick="cancelarAgendamentoGrupo('${item.id}', '${item.status}')" class="btn-ghost" title="${item.status === 'PENDENTE' ? 'Cancelar agendamento' : 'Remover do histórico'}" style="font-size:11.5px;padding:4px 8px;color:#dc2626;background:#fee2e2;border-color:#fecaca;">
                                <i class="fa-solid ${item.status === 'PENDENTE' ? 'fa-ban' : 'fa-trash'}"></i> ${item.status === 'PENDENTE' ? 'Cancelar' : 'Excluir'}
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `
            <div style="padding:16px;color:#dc2626;font-size:12.5px;">
                <i class="fa-solid fa-triangle-exclamation"></i> Erro ao carregar agendamentos: ${escapeHtml(e.message)}
            </div>
        `;
    }
}

function formatarDataHoraAmigavel(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return String(d);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${ano} às ${hora}:${min}`;
}

async function cancelarAgendamentoGrupo(id, status) {
    const txt = status === 'PENDENTE' 
        ? 'Deseja realmente CANCELAR este agendamento? A mensagem não será disparada.'
        : 'Deseja remover este registro do histórico?';
    if (!confirm(txt)) return;

    try {
        const res = await fetch(`/api/whatsapp/scheduled-groups/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            carregarAgendamentosGrupos();
        } else {
            alert('Erro: ' + (data.error || 'Falha ao remover agendamento'));
        }
    } catch (e) {
        alert('Erro ao conectar com servidor: ' + e.message);
    }
}

async function dispararAgendamentoAgora(id) {
    if (!confirm('Deseja antecipar e DISPARAR esta mensagem no grupo agora mesmo?')) return;

    try {
        const res = await fetch(`/api/whatsapp/scheduled-groups/${id}/send-now`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            alert('🎉 ' + data.message);
            carregarAgendamentosGrupos();
        } else {
            alert('Erro ao enviar: ' + (data.error || 'Falha ao enviar'));
        }
    } catch (e) {
        alert('Erro de conexão: ' + e.message);
    }
}

// ── ENQUETES PARA GRUPOS ──────────────────────────────────────────────────────

async function carregarGruposParaEnquete() {
    const select = document.getElementById('enqueteGrupo');
    if (!select) return;
    try {
        const res = await fetch('/api/whatsapp/groups');
        const data = await res.json();
        const grupos = data.groups || data || [];
        select.innerHTML = '<option value="">Selecione um grupo...</option>';
        grupos.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id || g.jid || '';
            opt.textContent = g.name || g.subject || g.nome || 'Grupo';
            select.appendChild(opt);
        });
    } catch (e) {
        console.error('Erro ao carregar grupos para enquete:', e);
        select.innerHTML = '<option value="">Erro ao carregar grupos</option>';
    }
}

function abrirModalEnquete() {
    // Limpar campos
    document.getElementById('enqueteTitulo').value = '';
    document.querySelectorAll('#enqueteOpcoes .enquete-opcao').forEach(inp => inp.value = '');
    // Carregar grupos
    carregarGruposParaEnquete();
    document.getElementById('modalEnquete').classList.remove('hidden');
}

function fecharModalEnquete() {
    document.getElementById('modalEnquete').classList.add('hidden');
}

function montarTextoEnquete(titulo, opcoes) {
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    let texto = `📊 *${titulo}*\n\n`;
    opcoes.forEach((opt, i) => {
        texto += `${emojis[i]} ${opt}\n`;
    });
    texto += '\n_Vote respondendo com o número da sua opção ou reagindo com o emoji correspondente!_ ✅';
    return texto;
}

async function enviarEnquete() {
    const titulo = document.getElementById('enqueteTitulo')?.value.trim();
    const opcoes = Array.from(document.querySelectorAll('#enqueteOpcoes .enquete-opcao'))
        .map(inp => inp.value.trim())
        .filter(Boolean);
    const grupoId = document.getElementById('enqueteGrupo')?.value;

    if (!titulo) return alert('Preencha o título da enquete.');
    if (opcoes.length < 2) return alert('Adicione pelo menos 2 opções.');
    if (!grupoId) return alert('Selecione um grupo de destino.');

    const texto = montarTextoEnquete(titulo, opcoes);

    try {
        const res = await fetch('/api/whatsapp/send-group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: grupoId, message: texto })
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ Enquete enviada com sucesso para o grupo!');
            fecharModalEnquete();

            // Adicionar à lista visual
            renderizarEnqueteNaLista(titulo, opcoes, grupoId);
        } else {
            alert('Erro ao enviar enquete: ' + (data.error || 'Falha no servidor'));
        }
    } catch (e) {
        alert('Erro de conexão: ' + e.message);
    }
}

function renderizarEnqueteNaLista(titulo, opcoes, grupoId) {
    const container = document.getElementById('listaEnquetes');
    if (!container) return;

    // Remove placeholder se existir
    const placeholder = container.querySelector('.card[style*="text-align:center"]');
    if (placeholder && placeholder.textContent.includes('Nenhuma enquete')) {
        placeholder.remove();
    }

    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    const agora = new Date().toLocaleString('pt-BR');

    const card = document.createElement('div');
    card.className = 'card';
    card.style = 'border-left:3px solid #8b5cf6;';
    card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:700;font-size:14px;color:#6d28d9;">
                <i class="fa-solid fa-square-poll-horizontal"></i> ${escapeHtml(titulo)}
            </span>
            <span class="pill pill-purple" style="font-size:10px;">
                <i class="fa-solid fa-paper-plane"></i> Enviada
            </span>
        </div>
        <div style="font-size:12.5px;color:var(--text);line-height:1.7;">
            ${opcoes.map((o, i) => `<div>${emojis[i]} ${escapeHtml(o)}</div>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px;">
            <i class="fa-regular fa-clock"></i> Enviada em ${agora}
        </div>
    `;
    container.prepend(card);
}

// ── 🎓 LOG DE ACESSOS (HOTMART CLUB) ───────────────────────────────────────────
let logsAcessoCache = [];

async function carregarLogsAcesso() {
    try {
        const res = await fetch('/api/hotmart/acessos');
        logsAcessoCache = await res.json();
        renderizarTabelaLogsAcesso(logsAcessoCache);
    } catch (e) {
        console.error('Erro ao carregar logs de acesso:', e);
    }
}

function renderizarTabelaLogsAcesso(lista) {
    const tbody = document.getElementById('tabelaLogsAcessoCorpo');
    const cnt = document.getElementById('contadorLogsAcesso');
    const badge = document.getElementById('badgeAcessosTotal');
    const statTotal = document.getElementById('statTotalAcessos');
    const statHoje = document.getElementById('statAcessosHoje');
    const statUltimo = document.getElementById('statUltimoAlunoAcesso');

    if (cnt) cnt.innerText = `${lista.length} registro(s)`;
    if (statTotal) statTotal.innerText = lista.length;
    if (badge) {
        badge.innerText = lista.length;
        badge.classList.toggle('hidden', lista.length === 0);
    }

    // Acessos hoje
    const hojeStr = new Date().toLocaleDateString('pt-BR');
    const acessosHoje = lista.filter(item => {
        return item.data_hora && item.data_hora.includes(hojeStr);
    }).length;
    if (statHoje) statHoje.innerText = acessosHoje;

    if (statUltimo) {
        statUltimo.innerText = lista.length > 0 ? (lista[0].nome || 'Aluno') : 'Nenhum';
    }

    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding:28px;text-align:center;color:var(--muted);">
                    <i class="fa-solid fa-graduation-cap" style="font-size:26px;color:#cbd5e1;display:block;margin-bottom:8px;"></i>
                    Nenhum primeiro acesso registrado ainda. Quando um aluno acessar a Hotmart Club, aparecerá aqui!
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = lista.map(ac => {
        const telLimpo = (ac.telefone || '').replace(/\D/g, '');
        const linkWpp = telLimpo ? `https://wa.me/${telLimpo}` : '#';
        const nomeEsc = escapeHtml(ac.nome || 'Aluno');
        const emailEsc = escapeHtml(ac.email || '--');
        const prodEsc = escapeHtml(ac.produto || 'Curso Online');
        const dataEsc = escapeHtml(ac.data_hora || '--');

        return `
            <tr style="border-bottom:1px solid var(--border);transition:background .15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td style="padding:12px 14px;font-weight:600;color:var(--text);white-space:nowrap;">
                    <i class="fa-regular fa-calendar-check" style="color:#7c3aed;margin-right:6px;"></i>
                    ${dataEsc}
                </td>
                <td style="padding:12px 14px;">
                    <div style="font-weight:700;color:var(--text);">${nomeEsc}</div>
                    <div style="font-size:11px;color:var(--muted);">${emailEsc}</div>
                </td>
                <td style="padding:12px 14px;">
                    <span style="font-weight:600;color:#0369a1;">
                        <i class="fa-solid fa-book-open" style="margin-right:5px;font-size:11px;"></i>${prodEsc}
                    </span>
                </td>
                <td style="padding:12px 14px;white-space:nowrap;">
                    <span style="font-family:monospace;font-size:12px;font-weight:600;">${ac.telefone || '--'}</span>
                </td>
                <td style="padding:12px 14px;">
                    <span class="pill pill-purple" style="font-size:10.5px;padding:3px 8px;">
                        <i class="fa-solid fa-check"></i> 1º Acesso Concluído
                    </span>
                </td>
                <td style="padding:12px 14px;text-align:right;white-space:nowrap;">
                    ${telLimpo ? `
                        <a href="${linkWpp}" target="_blank" class="btn-ghost" style="color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;font-size:11.5px;padding:4px 9px;border-radius:6px;text-decoration:none;display:inline-flex;align-items:center;gap:5px;" title="Conversar no WhatsApp">
                            <i class="fa-brands fa-whatsapp" style="font-size:13px;"></i> Chamar
                        </a>
                    ` : '--'}
                </td>
            </tr>
        `;
    }).join('');
}

function filtrarLogsAcesso() {
    const q = (document.getElementById('inputBuscaAcessos')?.value || '').toLowerCase().trim();
    if (!q) {
        renderizarTabelaLogsAcesso(logsAcessoCache);
        return;
    }
    const filtrados = logsAcessoCache.filter(item => {
        const n = (item.nome || '').toLowerCase();
        const e = (item.email || '').toLowerCase();
        const t = (item.telefone || '').toLowerCase();
        const p = (item.produto || '').toLowerCase();
        return n.includes(q) || e.includes(q) || t.includes(q) || p.includes(q);
    });
    renderizarTabelaLogsAcesso(filtrados);
}

async function limparLogsAcesso() {
    if (!confirm('Deseja realmente limpar todo o histórico de acessos registrados?')) return;
    try {
        await fetch('/api/hotmart/acessos/limpar', { method: 'POST' });
        logsAcessoCache = [];
        renderizarTabelaLogsAcesso([]);
        alert('Histórico de acessos limpo com sucesso.');
    } catch (e) {
        alert('Erro ao limpar histórico de acessos.');
    }
}

function abrirModalSimularAcesso() {
    const modal = document.getElementById('modalSimularAcesso');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalSimularAcesso() {
    const modal = document.getElementById('modalSimularAcesso');
    if (modal) modal.classList.add('hidden');
}

async function confirmarSimulacaoAcesso() {
    const nome = document.getElementById('simularAcessoNome')?.value.trim() || 'Aluno Demonstração';
    const email = document.getElementById('simularAcessoEmail')?.value.trim() || 'aluno@exemplo.com';
    const telefone = document.getElementById('simularAcessoTelefone')?.value.trim() || '21989886602';
    const produto = document.getElementById('simularAcessoProduto')?.value.trim() || 'Curso Online Completo';

    try {
        const res = await fetch('/api/hotmart/acessos/simular', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, telefone, produto })
        });
        const data = await res.json();
        fecharModalSimularAcesso();
        await carregarLogsAcesso();
        alert('🎉 Simulação realizada com sucesso! O acesso foi registrado no log.');
    } catch (e) {
        alert('Erro ao simular acesso: ' + e.message);
    }
}
