import os
import json
import time
import threading
import requests
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel

from flow import FlowEngine

CONFIG_FILE = "config.json"
LEADS_FILE = "leads.json"
SESSOES_FILE = "sessoes.json"
ACESSOS_FILE = "acessos_log.json"

NODE_BRIDGE_URL = os.getenv("NODE_BRIDGE_URL", "http://whatsapp_bridge:3000")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434")

flow_engine = FlowEngine()

def carregar_json(caminho: str, padrao: Any) -> Any:
    if os.path.exists(caminho):
        try:
            with open(caminho, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return padrao
    return padrao

def salvar_json(caminho: str, dados: Any) -> None:
    try:
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(dados, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[Main] Erro ao salvar {caminho}: {e}")

def normalizar_telefone_wpp(tel: str) -> str:
    if not tel:
        return ""
    digits = "".join(filter(str.isdigit, str(tel)))
    if not digits:
        return ""
    if len(digits) in [10, 11] and not digits.startswith("55"):
        return f"55{digits}"
    return digits

# ── RÉGUA DE PÓS-VENDA BACKGROUND DAEMON ───────────────────────────────────────
def processar_regua_pos_venda():
    cfg = carregar_json(CONFIG_FILE, {})
    hotmart_cfg = cfg.get("hotmart", {})
    regua_cfg = hotmart_cfg.get("regua_pos_venda", {})

    if not hotmart_cfg.get("ativo", True) or not regua_cfg.get("ativo", True):
        return {"processados": 0, "mensagens_enviadas": 0}

    mensagens_regua = sorted(regua_cfg.get("mensagens", []), key=lambda m: float(m.get("dias", 1)))
    if not mensagens_regua:
        return {"processados": 0, "mensagens_enviadas": 0}

    leads = carregar_json(LEADS_FILE, [])
    alterou = False
    total_enviadas = 0
    agora = time.time()

    link_acesso = hotmart_cfg.get("link_acesso", "https://app-vlc.hotmart.com/login")
    prod_padrao = hotmart_cfg.get("produto_padrao", "Curso Online")

    for l in leads:
        if l.get("regua_desativada"):
            continue
        st = str(l.get("status", ""))
        if any(term in st for term in ["Reembols", "Chargeback", "Recusado", "Cancelad", "Expirado"]):
            continue

        is_aluno = "Aluno" in st or "Aprovad" in st or l.get("hotmart_evento") == "COMPRA_APROVADA"
        if not is_aluno:
            continue

        tel = l.get("telefone")
        if not tel:
            continue

        aprov_ts = l.get("data_aprovacao_timestamp")
        if not aprov_ts:
            aprov_ts = int(time.time())
            l["data_aprovacao_timestamp"] = aprov_ts
            alterou = True

        enviados = l.setdefault("regua_enviados", [])
        segundos_passados = agora - aprov_ts
        dias_passados = segundos_passados / 86400.0

        for m in mensagens_regua:
            if not m.get("ativo", True):
                continue

            # 🎯 FILTRO POR CURSO / PRODUTO (MULTI-CURSOS)
            filtro_prod = str(m.get("filtro_produto") or "TODOS").strip()
            if filtro_prod and filtro_prod.upper() != "TODOS":
                prod_aluno = str(l.get("tipo_servico") or "")
                if filtro_prod.lower() not in prod_aluno.lower():
                    continue  # Aluno matriculado em outro curso

            tipo_disparo = m.get("tipo_disparo", "dias_apos_compra")
            m_id = m.get("id") or (f"data_{m.get('data_fixa')}" if tipo_disparo == "data_fixa" else f"dia_{m.get('dias', 1)}")

            deve_disparar = False

            if tipo_disparo == "data_fixa":
                data_fixa_str = str(m.get("data_fixa") or "").strip()
                if data_fixa_str:
                    try:
                        hora_fixa = str(m.get("hora_fixa") or "09:00").strip()
                        if "T" in data_fixa_str:
                            dt_alvo = datetime.strptime(data_fixa_str, "%Y-%m-%dT%H:%M")
                        elif " " in data_fixa_str:
                            dt_alvo = datetime.strptime(data_fixa_str, "%Y-%m-%d %H:%M")
                        else:
                            dt_alvo = datetime.strptime(f"{data_fixa_str} {hora_fixa}", "%Y-%m-%d %H:%M")

                        agora_dt = datetime.now()
                        if agora_dt >= dt_alvo and m_id not in enviados:
                            deve_disparar = True
                    except Exception as e_dt:
                        print(f"[Régua Data Fixa] Erro ao parsear data {data_fixa_str}: {e_dt}")
            else:
                m_dias = float(m.get("dias", 1))
                if dias_passados >= m_dias and m_id not in enviados:
                    deve_disparar = True

            if deve_disparar:
                msg_texto = m.get("mensagem", "")
                prod_nome = l.get("tipo_servico", "").replace("Curso: ", "") or prod_padrao
                nome_aluno = l.get("nome", "Aluno")

                # 🎯 Link de acesso personalizado do curso se configurado
                link_acesso_final = link_acesso
                cursos_dict = hotmart_cfg.get("cursos", {})
                for c_k, c_v in cursos_dict.items():
                    if isinstance(c_v, dict) and (c_k.lower() in prod_nome.lower() or prod_nome.lower() in c_k.lower()):
                        if c_v.get("link_acesso"):
                            link_acesso_final = c_v.get("link_acesso")
                        break

                msg_final = msg_texto.replace("{nome}", nome_aluno) \
                                     .replace("{produto}", prod_nome) \
                                     .replace("{link_acesso}", link_acesso_final)

                try:
                    requests.post(f"{NODE_BRIDGE_URL}/send", json={
                        "telefone": tel,
                        "mensagem": msg_final,
                        "delay_segundos": 2,
                        "simular_digitando": True,
                        "passo_id": m_id
                    }, timeout=10)
                    enviados.append(m_id)
                    regua_envios_ts = l.setdefault("regua_envios_ts", {})
                    regua_envios_ts[m_id] = int(agora)
                    alterou = True
                    total_enviadas += 1
                    print(f"[Régua Pós-Venda] Disparado {m_id} ({tipo_disparo}) para {nome_aluno} ({tel})")
                except Exception as e:
                    print(f"[Régua Pós-Venda] Erro ao enviar {m_id} para {tel}: {e}")

            # ── 🎯 RE-ENGAJAMENTO INTELIGENTE POR RASTREAMENTO (NÃO LEU OU NÃO CLICOU) ──
            reeng_ativo = m.get("reengajamento_ativo") or m.get("reengajar")
            reeng_msg = (m.get("reengajamento_msg") or m.get("reengajar_msg") or "").strip()
            if reeng_ativo and reeng_msg and (m_id in enviados):
                reeng_id = f"{m_id}_reeng"
                if reeng_id not in enviados:
                    reeng_dias = float(m.get("reengajamento_dias") or m.get("reengajar_dias") or 2)
                    ts_passo = l.get("regua_envios_ts", {}).get(m_id, aprov_ts)
                    dias_desde_passo = (agora - ts_passo) / 86400.0

                    if dias_desde_passo >= reeng_dias:
                        # 🎯 VERIFICAÇÃO INTELIGENTE DE RASTREAMENTO:
                        rast = l.get("rastreamento", {})
                        msgs_rast = rast.get("mensagens", {})
                        foi_lida = any(info.get("status") == "LIDA" or info.get("ack") == 3 for info in msgs_rast.values() if isinstance(info, dict))
                        links_clicados = [c.get("passo_id") for c in rast.get("links_clicados", []) if isinstance(c, dict)]
                        foi_clicado = (m_id in links_clicados) or (len(links_clicados) > 0)

                        # Se o aluno já visualizou E já clicou no link, ele já está 100% engajado! Lembrete dispensado
                        if foi_lida and foi_clicado:
                            print(f"[Régua Re-engajamento] Aluno {nome_aluno} já leu e clicou no link do passo {m_id}. Lembrete dispensado.")
                            enviados.append(reeng_id)
                            alterou = True
                            continue

                        # Se NÃO visualizou ou NÃO clicou, dispara a mensagem de re-engajamento!
                        prod_nome = l.get("tipo_servico", "").replace("Curso: ", "") or prod_padrao
                        nome_aluno = l.get("nome", "Aluno")
                        link_acesso_final = link_acesso
                        cursos_dict = hotmart_cfg.get("cursos", {})
                        for c_k, c_v in cursos_dict.items():
                            if isinstance(c_v, dict) and (c_k.lower() in prod_nome.lower() or prod_nome.lower() in c_k.lower()):
                                if c_v.get("link_acesso"):
                                    link_acesso_final = c_v.get("link_acesso")
                                break

                        msg_reeng_final = reeng_msg.replace("{nome}", nome_aluno) \
                                                   .replace("{produto}", prod_nome) \
                                                   .replace("{link_acesso}", link_acesso_final)
                        try:
                            requests.post(f"{NODE_BRIDGE_URL}/send", json={
                                "telefone": tel,
                                "mensagem": msg_reeng_final,
                                "delay_segundos": 2,
                                "simular_digitando": True,
                                "passo_id": reeng_id
                            }, timeout=10)
                            enviados.append(reeng_id)
                            alterou = True
                            total_enviadas += 1
                            motivo = []
                            if not foi_lida: motivo.append("não visualizou")
                            if not foi_clicado: motivo.append("não clicou")
                            print(f"[Régua Re-engajamento] Disparado lembrete de {m_id} para {nome_aluno} ({tel}) [Motivo: {' e '.join(motivo)}]")
                        except Exception as e_reeng:
                            print(f"[Régua Re-engajamento] Erro ao enviar {reeng_id} para {tel}: {e_reeng}")

    if alterou:
        salvar_json(LEADS_FILE, leads)

    return {"processados": len(leads), "mensagens_enviadas": total_enviadas}

def _loop_regua_pos_venda():
    while True:
        try:
            processar_regua_pos_venda()
        except Exception as e:
            print(f"[Régua Daemon] Erro no loop: {e}")
        time.sleep(300) # Checa a cada 5 minutos

@asynccontextmanager
async def lifespan(app: FastAPI):
    t = threading.Thread(target=_loop_regua_pos_venda, daemon=True)
    t.start()
    print("[HOTMART BOT] Daemon da Régua de Pós-Venda iniciado com sucesso.")
    yield

app = FastAPI(title="Hotmart WhatsApp Automation API", lifespan=lifespan)

# ── WEBHOOK HOTMART & MAKE.COM ────────────────────────────────────────────────
@app.post("/webhook/hotmart")
async def webhook_hotmart(payload: dict, background_tasks: BackgroundTasks):
    cfg = carregar_json(CONFIG_FILE, {})
    hotmart_cfg = cfg.get("hotmart", {})

    token_esperado = hotmart_cfg.get("hottok", "").strip()
    if token_esperado:
        hottok_recebido = payload.get("hottok") or payload.get("data", {}).get("hottok")
        if hottok_recebido != token_esperado:
            return {"status": "unauthorized", "erro": "Hottok inválido"}

    evento = payload.get("event") or payload.get("data", {}).get("event") or payload.get("event_type") or payload.get("status") or ""
    evento_upper = str(evento).upper()

    data_payload = payload.get("data", payload)
    buyer = data_payload.get("buyer", {}) if isinstance(data_payload, dict) else {}
    product = data_payload.get("product", {}) if isinstance(data_payload, dict) else {}
    purchase = data_payload.get("purchase", {}) if isinstance(data_payload, dict) else {}
    payment = purchase.get("payment", {}) if isinstance(purchase, dict) else {}

    nome = buyer.get("name") or payload.get("buyer_name") or payload.get("first_name") or payload.get("name") or payload.get("nome") or "Futuro Aluno"
    tel_raw = buyer.get("checkout_phone") or buyer.get("phone") or payload.get("buyer_phone") or payload.get("phone") or payload.get("telefone") or payload.get("celular") or payload.get("phone_checkout_number") or ""
    ddd_raw = payload.get("phone_checkout_local_code") or buyer.get("checkout_phone_local_code") or ""
    if ddd_raw and not str(tel_raw).startswith(str(ddd_raw)):
        tel_raw = f"{ddd_raw}{tel_raw}"

    telefone = normalizar_telefone_wpp(tel_raw)
    if not telefone:
        return {"status": "ignored", "motivo": "Telefone do comprador não informado"}

    prod_nome = product.get("name") or payload.get("prod_name") or payload.get("produto") or payload.get("product_name") or hotmart_cfg.get("produto_padrao", "Curso Online")

    # 🎯 Busca configurações específicas deste curso no catálogo
    cursos_dict = hotmart_cfg.get("cursos", {})
    curso_info = None
    for c_k, c_v in cursos_dict.items():
        if isinstance(c_v, dict) and (c_k.lower() in prod_nome.lower() or prod_nome.lower() in c_k.lower()):
            curso_info = c_v
            break

    # Prioridade para checkout_url: 1. Vem direto no webhook; 2. Catálogo do curso; 3. Fallback da conta
    checkout_url = purchase.get("checkout_url") or payload.get("checkout_url")
    if not checkout_url and curso_info:
        checkout_url = curso_info.get("link_checkout")
    if not checkout_url:
        checkout_url = hotmart_cfg.get("link_checkout", "")

    codigo_pix = payment.get("pix_code") or payment.get("billet_barcode") or payload.get("pix_code") or payload.get("billet_barcode") or ""
    
    # Prioridade para link_acesso: 1. Catálogo do curso; 2. Fallback da conta (Hotmart Club)
    link_acesso = (curso_info.get("link_acesso") if curso_info and curso_info.get("link_acesso") else None) or hotmart_cfg.get("link_acesso", "https://app-vlc.hotmart.com/login")

    tipo_evento = None
    msg_modelo = None
    status_lead = None

    if any(k in evento_upper for k in ["SHOPPING_CART", "ABANDONMENT", "ABANDONO"]):
        tipo_evento = "CARRINHO_ABANDONADO"
        status_lead = "Carrinho Abandonado (Hotmart)"
        msg_modelo = hotmart_cfg.get("msg_abandono")
    elif any(k in evento_upper for k in ["BILLET", "WAITING", "AGUARDANDO", "PRINTED"]):
        tipo_evento = "PIX_BOLETO_GERADO"
        status_lead = "Boleto/Pix Gerado (Hotmart)"
        msg_modelo = hotmart_cfg.get("msg_pix_boleto")
    elif any(k in evento_upper for k in ["APPROVED", "COMPLETE", "APROVADO", "CONCLUIDO"]):
        tipo_evento = "COMPRA_APROVADA"
        status_lead = "Aluno Matriculado (Hotmart)"
        msg_modelo = hotmart_cfg.get("msg_aprovado")
    elif any(k in evento_upper for k in ["REFUNDED", "REEMBOLS"]):
        tipo_evento = "REEMBOLSADO"
        status_lead = "Reembolsado (Hotmart)"
        msg_modelo = hotmart_cfg.get("msg_reembolsado")
    elif any(k in evento_upper for k in ["CHARGEBACK"]):
        tipo_evento = "CHARGEBACK"
        status_lead = "Chargeback (Hotmart)"
        msg_modelo = None
    elif any(k in evento_upper for k in ["EXPIRED", "EXPIRADO"]):
        tipo_evento = "PAGAMENTO_EXPIRADO"
        status_lead = "Pagamento Expirado (Hotmart)"
        msg_modelo = hotmart_cfg.get("msg_expirado")
    elif any(k in evento_upper for k in ["CANCELED", "CANCELADO", "RECUSADO"]):
        tipo_evento = "CARTAO_RECUSADO"
        status_lead = "Cartão Recusado (Hotmart)"
        msg_modelo = hotmart_cfg.get("msg_cancelado")
    elif any(k in evento_upper for k in ["CLUB_FIRST_ACESS", "CLUB_FIRST_ACCESS", "FIRST_ACCESS", "FIRST_ACESS", "PRIMEIRO_ACESSO", "CLUB_ACCESS"]):
        tipo_evento = "PRIMEIRO_ACESSO"
        status_lead = "Primeiro Acesso Concluído (Hotmart)"
        msg_modelo = None  # Aviso é para o profissional (registrado no Log de Acessos), não para o aluno
    else:
        return {"status": "unhandled_event", "evento": evento_upper}

    # 🎓 REGISTRO NO LOG DE ACESSOS (PARA O PROFISSIONAL VISUALIZAR)
    if tipo_evento == "PRIMEIRO_ACESSO":
        try:
            acessos = carregar_json(ACESSOS_FILE, [])
            reg_acesso = {
                "id": f"acesso_{int(time.time())}_{telefone[-4:] if telefone else '0000'}",
                "nome": nome,
                "email": buyer.get("email") or payload.get("email") or data_payload.get("email") or "",
                "telefone": telefone,
                "produto": prod_nome,
                "data_hora": datetime.now().strftime("%d/%m/%Y às %H:%M:%S"),
                "timestamp": int(time.time()),
                "evento": "club_first_acess"
            }
            acessos.insert(0, reg_acesso)
            salvar_json(ACESSOS_FILE, acessos[:300])
            print(f"[Log Acesso Hotmart Club] Primeiro acesso registrado: {nome} - {prod_nome}")
        except Exception as e_ac:
            print(f"[Log Acesso] Erro ao gravar registro de acesso: {e_ac}")

    leads = carregar_json(LEADS_FILE, [])
    lead_existente = next((l for l in leads if l.get("telefone") == telefone), None)

    dados_atualizados = {
        "nome": nome,
        "telefone": telefone,
        "status": status_lead,
        "tipo_servico": f"Curso: {prod_nome}",
        "origem": "Hotmart",
        "data_evento": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "hotmart_evento": tipo_evento
    }

    if tipo_evento == "PRIMEIRO_ACESSO":
        dados_atualizados["primeiro_acesso_data"] = datetime.now().strftime("%d/%m/%Y %H:%M")
        dados_atualizados["acessou_plataforma"] = True
    elif tipo_evento == "COMPRA_APROVADA":
        dados_atualizados["data_aprovacao_timestamp"] = int(time.time())
        dados_atualizados["regua_enviados"] = lead_existente.get("regua_enviados", []) if lead_existente else []
        dados_atualizados["regua_desativada"] = False
    elif tipo_evento in ["REEMBOLSADO", "CHARGEBACK", "CARTAO_RECUSADO", "PAGAMENTO_EXPIRADO"]:
        dados_atualizados["regua_desativada"] = True

    if lead_existente:
        lead_existente.update(dados_atualizados)
    else:
        dados_atualizados["lead_id"] = f"hot_{int(time.time())}_{telefone[-4:]}"
        leads.append(dados_atualizados)
    salvar_json(LEADS_FILE, leads)

    if hotmart_cfg.get("ativo", True) and msg_modelo:
        msg_final = msg_modelo.replace("{nome}", nome) \
                              .replace("{produto}", prod_nome) \
                              .replace("{link_checkout}", checkout_url) \
                              .replace("{codigo_pix}", codigo_pix if codigo_pix else "Verifique o código enviado no seu e-mail") \
                              .replace("{link_acesso}", link_acesso)

        def enviar_hotmart_async():
            try:
                requests.post(f"{NODE_BRIDGE_URL}/send", json={
                    "telefone": telefone,
                    "mensagem": msg_final,
                    "delay_segundos": 3,
                    "simular_digitando": True
                }, timeout=10)
            except Exception as e:
                print(f"[Hotmart Webhook] Erro ao enviar para {telefone}: {e}")

        background_tasks.add_task(enviar_hotmart_async)

    # 📢 ALERTA AUTOMÁTICO EM GRUPO DO WHATSAPP (SE HABILITADO)
    grupo_alertas_id = hotmart_cfg.get("grupo_alertas_id")
    grupo_alertas_ativo = hotmart_cfg.get("grupo_alertas_ativo", False)
    alertas_eventos = hotmart_cfg.get("grupo_alertas_eventos", ["COMPRA_APROVADA", "CARRINHO_ABANDONADO", "PIX_BOLETO_GERADO"])

    if grupo_alertas_ativo and grupo_alertas_id and tipo_evento in alertas_eventos:
        msg_alerta = None
        data_hora = datetime.now().strftime("%d/%m/%Y às %H:%M")
        if tipo_evento == "COMPRA_APROVADA":
            msg_alerta = f"🎉 *NOVA VENDA CONFIRMADA!*\n\n👤 *Aluno:* {nome}\n📚 *Curso:* {prod_nome}\n📱 *Telefone:* {telefone}\n⏰ *Data:* {data_hora}\n\n✅ Aluno matriculado com sucesso!"
        elif tipo_evento == "CARRINHO_ABANDONADO":
            msg_alerta = f"🛒 *CARRINHO ABANDONADO!*\n\n👤 *Cliente:* {nome}\n📚 *Curso:* {prod_nome}\n📱 *Telefone:* {telefone}\n⏰ *Data:* {data_hora}\n\n🤖 O robô já disparou mensagem de resgate no WhatsApp!"
        elif tipo_evento == "PIX_BOLETO_GERADO":
            msg_alerta = f"💳 *PIX / BOLETO GERADO!*\n\n👤 *Cliente:* {nome}\n📚 *Curso:* {prod_nome}\n📱 *Telefone:* {telefone}\n⏰ *Data:* {data_hora}\n\n⏳ Aguardando confirmação do banco."
        elif tipo_evento == "CARTAO_RECUSADO":
            msg_alerta = f"❌ *CARTÃO RECUSADO PELO BANCO!*\n\n👤 *Cliente:* {nome}\n📚 *Curso:* {prod_nome}\n📱 *Telefone:* {telefone}\n\n🚨 Link alternativo já enviado pelo robô!"
        elif tipo_evento == "PRIMEIRO_ACESSO":
            msg_alerta = f"🎓 *PRIMEIRO ACESSO REGISTRADO!*\n\n👤 *Aluno:* {nome}\n📚 *Curso:* {prod_nome}\n📱 *Telefone:* {telefone}\n⏰ *Data:* {data_hora}\n\n✅ O aluno acabou de entrar na área de membros!"

        if msg_alerta:
            def enviar_alerta_grupo():
                try:
                    requests.post(f"{NODE_BRIDGE_URL}/send", json={
                        "telefone": grupo_alertas_id,
                        "mensagem": msg_alerta,
                        "delay_segundos": 1,
                        "simular_digitando": False
                    }, timeout=10)
                except Exception as e_grp:
                    print(f"[Alerta Grupo] Erro ao enviar para grupo {grupo_alertas_id}: {e_grp}")
            background_tasks.add_task(enviar_alerta_grupo)

    return {"status": "success", "evento": tipo_evento, "telefone": telefone, "nome": nome}

@app.get("/api/hotmart/cursos")
async def listar_cursos_hotmart():
    cfg = carregar_json(CONFIG_FILE, {})
    hotmart_cfg = cfg.get("hotmart", {})
    prod_padrao = hotmart_cfg.get("produto_padrao", "Curso Online Completo")
    cursos_dict = hotmart_cfg.get("cursos", {})
    leads = carregar_json(LEADS_FILE, [])

    resultado = {}
    # 1. Cursos salvos no catálogo
    for nome, dados in cursos_dict.items():
        if isinstance(dados, dict):
            resultado[nome] = {
                "nome": nome,
                "link_checkout": dados.get("link_checkout", ""),
                "link_acesso": dados.get("link_acesso", hotmart_cfg.get("link_acesso", "https://app-vlc.hotmart.com/login")),
                "origem": "configurado"
            }
        else:
            resultado[nome] = {
                "nome": nome,
                "link_checkout": "",
                "link_acesso": hotmart_cfg.get("link_acesso", "https://app-vlc.hotmart.com/login"),
                "origem": "configurado"
            }

    # 2. Produto padrão se ainda não estiver na lista
    if prod_padrao and prod_padrao not in resultado:
        resultado[prod_padrao] = {
            "nome": prod_padrao,
            "link_checkout": hotmart_cfg.get("link_checkout", ""),
            "link_acesso": hotmart_cfg.get("link_acesso", "https://app-vlc.hotmart.com/login"),
            "origem": "padrao"
        }

    # 3. Cursos detectados nos leads da Hotmart
    for l in leads:
        ts = str(l.get("tipo_servico") or "").replace("Curso: ", "").strip()
        if ts and ts not in resultado:
            resultado[ts] = {
                "nome": ts,
                "link_checkout": "",
                "link_acesso": hotmart_cfg.get("link_acesso", "https://app-vlc.hotmart.com/login"),
                "origem": "detectado"
            }

    nomes_ordenados = sorted(list(resultado.keys()))
    return {
        "cursos": nomes_ordenados,
        "detalhes": resultado
    }

class SalvarCursoRequest(BaseModel):
    nome: str
    link_checkout: Optional[str] = ""
    link_acesso: Optional[str] = ""

@app.post("/api/hotmart/cursos/salvar")
async def salvar_curso(data: SalvarCursoRequest):
    if not data.nome or not data.nome.strip():
        return {"status": "error", "erro": "Nome do curso é obrigatório"}
    cfg = carregar_json(CONFIG_FILE, {})
    hotmart_cfg = cfg.setdefault("hotmart", {})
    cursos = hotmart_cfg.setdefault("cursos", {})
    nome_limpo = data.nome.strip()
    cursos[nome_limpo] = {
        "link_checkout": (data.link_checkout or "").strip(),
        "link_acesso": (data.link_acesso or "").strip() or hotmart_cfg.get("link_acesso", "https://app-vlc.hotmart.com/login")
    }
    salvar_json(CONFIG_FILE, cfg)
    return {"status": "success", "message": f"Curso '{nome_limpo}' salvo no catálogo com sucesso!"}

@app.delete("/api/hotmart/cursos/{nome}")
async def excluir_curso(nome: str):
    cfg = carregar_json(CONFIG_FILE, {})
    cursos = cfg.get("hotmart", {}).get("cursos", {})
    if nome in cursos:
        del cursos[nome]
        salvar_json(CONFIG_FILE, cfg)
    return {"status": "success", "message": f"Curso '{nome}' removido do catálogo."}

class AlertaGrupoTeste(BaseModel):
    grupo_id: str
    tipo_evento: Optional[str] = "COMPRA_APROVADA"

@app.post("/api/hotmart/testar_grupo")
async def testar_alerta_grupo(data: AlertaGrupoTeste):
    if not data.grupo_id:
        return {"status": "error", "erro": "ID do grupo não informado"}

    cfg = carregar_json(CONFIG_FILE, {})
    prod_nome = cfg.get("hotmart", {}).get("produto_padrao", "Curso Online Exemplo")
    data_hora = datetime.now().strftime("%d/%m/%Y às %H:%M")
    
    msg = f"🔔 *TESTE DE ALERTA NO GRUPO!*\n\n🎉 Se você está lendo esta mensagem, o robô está 100% integrado e pronto para notificar sua equipe sobre novas vendas e carrinhos neste grupo!\n\n📚 *Curso Exemplo:* {prod_nome}\n⏰ *Data:* {data_hora}"

    try:
        r = requests.post(f"{NODE_BRIDGE_URL}/send", json={
            "telefone": data.grupo_id,
            "mensagem": msg,
            "delay_segundos": 1,
            "simular_digitando": False
        }, timeout=10)
        return {"status": "success", "message": "Mensagem de teste enviada para o grupo com sucesso!"}
    except Exception as e:
        return {"status": "error", "erro": str(e)}

class DisparoCursoRequest(BaseModel):
    curso: str = "TODOS"
    mensagem: str

@app.post("/api/hotmart/disparo_curso")
async def disparar_comunicado_curso(req: DisparoCursoRequest, background_tasks: BackgroundTasks):
    if not req.mensagem or not req.mensagem.strip():
        return {"status": "error", "erro": "Mensagem vazia"}

    leads = carregar_json(LEADS_FILE, [])
    cfg = carregar_json(CONFIG_FILE, {})
    hotmart_cfg = cfg.get("hotmart", {})
    prod_padrao = hotmart_cfg.get("produto_padrao", "Curso Online")
    link_acesso = hotmart_cfg.get("link_acesso", "https://app-vlc.hotmart.com/login")

    filtro = str(req.curso or "TODOS").strip()

    destinatarios = []
    for l in leads:
        if l.get("regua_desativada"):
            continue
        st = str(l.get("status") or "")
        if any(term in st for term in ["Reembols", "Chargeback", "Recusado", "Cancelad", "Expirado"]):
            continue
        is_aluno = "Aluno" in st or "Aprovad" in st or l.get("hotmart_evento") == "COMPRA_APROVADA"
        if not is_aluno:
            continue

        tel = l.get("telefone")
        if not tel:
            continue

        prod_aluno = str(l.get("tipo_servico") or "")
        if filtro and filtro.upper() != "TODOS":
            if filtro.lower() not in prod_aluno.lower():
                continue

        destinatarios.append({
            "telefone": tel,
            "nome": l.get("nome", "Aluno"),
            "produto": prod_aluno.replace("Curso: ", "") or prod_padrao
        })

    if not destinatarios:
        return {"status": "warning", "total": 0, "message": "Nenhum aluno ativo encontrado para o curso selecionado."}

    def disparar_lote():
        for d in destinatarios:
            msg_final = req.mensagem.replace("{nome}", d["nome"]) \
                                    .replace("{produto}", d["produto"]) \
                                    .replace("{link_acesso}", link_acesso)
            try:
                requests.post(f"{NODE_BRIDGE_URL}/send", json={
                    "telefone": d["telefone"],
                    "mensagem": msg_final,
                    "delay_segundos": 2,
                    "simular_digitando": True
                }, timeout=10)
                time.sleep(2.5)
            except Exception as e_env:
                print(f"[Disparo Curso] Erro ao enviar para {d['telefone']}: {e_env}")

    background_tasks.add_task(disparar_lote)

    return {
        "status": "success",
        "total": len(destinatarios),
        "message": f"Iniciado disparo seguro para {len(destinatarios)} aluno(s) do curso selecionado!"
    }

@app.post("/api/hotmart/regua/verificar_agora")
async def verificar_regua_agora():
    return processar_regua_pos_venda()

class TestePassoRegua(BaseModel):
    telefone: str
    nome: Optional[str] = "Aluno Teste"
    passo_id: str

@app.post("/api/hotmart/regua/testar_passo")
async def testar_passo_regua(data: TestePassoRegua):
    tel = normalizar_telefone_wpp(data.telefone)
    if not tel:
        return {"status": "error", "erro": "Telefone inválido"}

    cfg = carregar_json(CONFIG_FILE, {})
    hotmart_cfg = cfg.get("hotmart", {})
    regua_cfg = hotmart_cfg.get("regua_pos_venda", {})
    passos = regua_cfg.get("mensagens", [])
    passo = next((p for p in passos if p.get("id") == data.passo_id), None)

    if not passo:
        return {"status": "error", "erro": "Passo não encontrado"}

    prod_nome = hotmart_cfg.get("produto_padrao", "Curso Online")
    link_acesso = hotmart_cfg.get("link_acesso", "https://app-vlc.hotmart.com/login")

    msg_final = passo.get("mensagem", "").replace("{nome}", data.nome) \
                                         .replace("{produto}", prod_nome) \
                                         .replace("{link_acesso}", link_acesso)

    try:
        r = requests.post(f"{NODE_BRIDGE_URL}/send", json={
            "telefone": tel,
            "mensagem": msg_final,
            "delay_segundos": 2,
            "simular_digitando": True
        }, timeout=10)
        return {"status": "success", "telefone": tel, "passo": passo.get("titulo")}
    except Exception as e:
        return {"status": "error", "erro": str(e)}

@app.get("/api/hotmart/stats")
async def obter_estatisticas_hotmart():
    leads = carregar_json(LEADS_FILE, [])
    carrinhos = sum(1 for l in leads if "Abandonado" in str(l.get("status", "")) or l.get("hotmart_evento") == "CARRINHO_ABANDONADO")
    boletos = sum(1 for l in leads if "Boleto" in str(l.get("status", "")) or "Pix" in str(l.get("status", "")) or l.get("hotmart_evento") == "PIX_BOLETO_GERADO")
    alunos = sum(1 for l in leads if ("Aluno" in str(l.get("status", "")) or "Aprovad" in str(l.get("status", "")) or l.get("hotmart_evento") == "COMPRA_APROVADA") and not l.get("regua_desativada"))
    recusados = sum(1 for l in leads if "Recusado" in str(l.get("status", "")) or "Cancelad" in str(l.get("status", "")) or l.get("hotmart_evento") == "CARTAO_RECUSADO")
    expirados = sum(1 for l in leads if "Expirado" in str(l.get("status", "")) or l.get("hotmart_evento") == "PAGAMENTO_EXPIRADO")
    reembolsos = sum(1 for l in leads if "Reembols" in str(l.get("status", "")) or "Chargeback" in str(l.get("status", "")) or l.get("hotmart_evento") in ["REEMBOLSADO", "CHARGEBACK"])

    return {
        "total_hotmart": len(leads),
        "carrinhos_abandonados": carrinhos,
        "boletos_pix_gerados": boletos,
        "alunos_matriculados": alunos,
        "cartoes_recusados": recusados,
        "pagamentos_expirados": expirados,
        "reembolsos": reembolsos,
        "leads_recentes": leads[-15:]
    }

class TesteHotmartData(BaseModel):
    telefone: str
    nome: Optional[str] = "Aluno Teste"
    tipo_evento: str = "CARRINHO_ABANDONADO"

@app.post("/api/hotmart/testar")
async def testar_webhook_hotmart(data: TesteHotmartData, background_tasks: BackgroundTasks):
    tel = normalizar_telefone_wpp(data.telefone)
    ev_map = {
        "CARRINHO_ABANDONADO": "PURCHASE_OUT_OF_SHOPPING_CART",
        "PIX_BOLETO_GERADO": "PURCHASE_WAITING_PAYMENT",
        "COMPRA_APROVADA": "PURCHASE_APPROVED",
        "CARTAO_RECUSADO": "PURCHASE_CANCELED",
        "PAGAMENTO_EXPIRADO": "PURCHASE_EXPIRED",
        "REEMBOLSADO": "PURCHASE_REFUNDED",
        "CHARGEBACK": "PURCHASE_CHARGEBACK",
        "PRIMEIRO_ACESSO": "club_first_acess"
    }
    evento_real = ev_map.get(data.tipo_evento, "PURCHASE_APPROVED")

    payload_simulado = {
        "event": evento_real,
        "data": {
            "buyer": { "name": data.nome, "checkout_phone": tel, "email": "aluno.teste@exemplo.com" },
            "product": { "name": "Curso de Teste (Simulação Hotmart)" },
            "purchase": {
                "status": "APPROVED" if data.tipo_evento == "COMPRA_APROVADA" else ("REFUNDED" if data.tipo_evento == "REEMBOLSADO" else "WAITING_PAYMENT"),
                "checkout_url": "https://pay.hotmart.com/?src=simulacao_teste",
                "payment": { "pix_code": "00020126580014br.gov.bcb.pix0136SIMULACAO_HOTMART_PIX_CODE_TESTE5204000053039865802BR" }
            }
        }
    }
    return await webhook_hotmart(payload_simulado, background_tasks)

# ── 🎓 ROTAS DE LOG DE ACESSOS (HOTMART CLUB) ──────────────────────────────────
@app.get("/api/hotmart/acessos")
async def obter_logs_acesso():
    return carregar_json(ACESSOS_FILE, [])

@app.post("/api/hotmart/acessos/limpar")
async def limpar_logs_acesso():
    salvar_json(ACESSOS_FILE, [])
    return {"status": "success", "mensagem": "Histórico de acessos limpo com sucesso"}

class SimularAcessoData(BaseModel):
    nome: Optional[str] = "Aluno Demonstração"
    telefone: Optional[str] = "21989886602"
    produto: Optional[str] = "Curso Online Completo"
    email: Optional[str] = "aluno@exemplo.com"

@app.post("/api/hotmart/acessos/simular")
async def simular_acesso_club(data: SimularAcessoData, background_tasks: BackgroundTasks):
    tel = normalizar_telefone_wpp(data.telefone)
    payload_acesso = {
        "event": "club_first_acess",
        "data": {
            "buyer": {
                "name": data.nome,
                "checkout_phone": tel,
                "email": data.email
            },
            "product": {
                "name": data.produto
            }
        }
    }
# ── 📊 RASTREAMENTO DE ENTREGA, LEITURA & CLIQUES ─────────────────────────────
@app.post("/api/rastreamento/ack")
async def registrar_ack(data: dict):
    tel = normalizar_telefone_wpp(data.get("telefone", ""))
    ack = data.get("ack")
    ack_nome = data.get("ackNome")
    msg_id = data.get("msgId")
    data_hora = data.get("data")

    leads = carregar_json(LEADS_FILE, [])
    alterou = False
    for l in leads:
        if l.get("telefone") == tel:
            rast = l.setdefault("rastreamento", {})
            msgs = rast.setdefault("mensagens", {})
            msgs[msg_id] = {
                "ack": ack,
                "status": ack_nome,
                "atualizado_em": data_hora
            }
            if ack == 2:
                rast["ultima_entrega"] = data_hora
            elif ack == 3:
                rast["ultima_leitura"] = data_hora
                l["ultima_mensagem_lida"] = True
            alterou = True
            break
    if alterou:
        salvar_json(LEADS_FILE, leads)
    return {"status": "ok"}

@app.post("/api/rastreamento/clique")
async def registrar_clique(data: dict):
    tel = normalizar_telefone_wpp(data.get("telefone", ""))
    passo_id = data.get("passoId")
    url = data.get("urlDestino")
    data_clique = data.get("dataClique")

    leads = carregar_json(LEADS_FILE, [])
    alterou = False
    for l in leads:
        if l.get("telefone") == tel:
            rast = l.setdefault("rastreamento", {})
            cliques = rast.setdefault("links_clicados", [])
            cliques.append({
                "passo_id": passo_id,
                "url": url,
                "data_clique": data_clique
            })
            l["clicou_no_link"] = True
            l["ultimo_clique_data"] = data_clique
            alterou = True
            print(f"[Rastreamento] Lead {l.get('nome')} ({tel}) clicou no link do passo {passo_id}")
            break
    if alterou:
        salvar_json(LEADS_FILE, leads)
    return {"status": "ok"}

@app.get("/api/rastreamento/lead/{telefone}")
async def obter_rastreamento_lead(telefone: str):
    tel = normalizar_telefone_wpp(telefone)
    leads = carregar_json(LEADS_FILE, [])
    lead = next((l for l in leads if l.get("telefone") == tel), None)
    if not lead:
        return {"telefone": tel, "encontrado": False, "rastreamento": {}}
    return {
        "telefone": tel,
        "nome": lead.get("nome"),
        "encontrado": True,
        "rastreamento": lead.get("rastreamento", {})
    }

# ── ROTAS GERAIS & SETTINGS ───────────────────────────────────────────────────
@app.get("/api/settings")
async def obter_settings():
    return carregar_json(CONFIG_FILE, {})

@app.post("/api/settings")
async def salvar_settings(novos_dados: dict):
    cfg = carregar_json(CONFIG_FILE, {})
    cfg.update(novos_dados)
    salvar_json(CONFIG_FILE, cfg)
    return {"status": "success"}

@app.get("/api/leads")
async def listar_leads():
    return carregar_json(LEADS_FILE, [])

@app.post("/api/leads/limpar")
async def limpar_leads():
    salvar_json(LEADS_FILE, [])
    salvar_json(SESSOES_FILE, {})
    return {"status": "success", "message": "Todos os dados de leads e testes foram limpos com sucesso!"}

@app.get("/api/sessoes")
async def listar_sessoes():
    return carregar_json(SESSOES_FILE, {})

class PausarRequest(BaseModel):
    telefone: str

@app.post("/api/pausar_bot")
async def pausar_bot(req: PausarRequest):
    tel = normalizar_telefone_wpp(req.telefone)
    flow_engine.atualizar_sessao(tel, {"bot_ativo": False})
    return {"success": True}

@app.post("/api/voltar_bot")
async def voltar_bot(req: PausarRequest):
    tel = normalizar_telefone_wpp(req.telefone)
    flow_engine.atualizar_sessao(tel, {"bot_ativo": True})
    return {"success": True}

# ── IA / OLLAMA ───────────────────────────────────────────────────────────────
@app.get("/api/ia/config")
async def obter_ia_config():
    cfg = carregar_json(CONFIG_FILE, {})
    return {
        "ia_ativa": cfg.get("ia_ativa", True),
        "ia_modelo": cfg.get("ia_modelo", "llama3"),
        "ia_url": cfg.get("ia_url", OLLAMA_URL),
        "prompt_ia": cfg.get("prompt_ia", "")
    }

@app.post("/api/ia/config")
async def salvar_ia_config(dados: dict):
    cfg = carregar_json(CONFIG_FILE, {})
    cfg.update(dados)
    salvar_json(CONFIG_FILE, cfg)
    return {"success": True}

@app.get("/api/ia/modelos")
async def listar_modelos_ia():
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if r.status_code == 200:
            mods = [m["name"] for m in r.json().get("models", [])]
            return {"online": True, "modelos": mods}
    except Exception:
        pass
    return {"online": False, "modelos": []}

@app.post("/api/ia/testar")
async def testar_ia():
    cfg = carregar_json(CONFIG_FILE, {})
    prompt = cfg.get("prompt_ia", "Você é um consultor de vendas de cursos.")
    modelo = cfg.get("ia_modelo", "llama3")
    try:
        r = requests.post(f"{OLLAMA_URL}/api/generate", json={
            "model": modelo,
            "prompt": f"{prompt}\n\nCliente: Olá, como funciona o curso e tem certificado?",
            "stream": False
        }, timeout=20)
        if r.status_code == 200:
            return {"success": True, "resposta": r.json().get("response", "")}
        return {"success": False, "resposta": f"Erro {r.status_code}: {r.text}"}
    except Exception as e:
        return {"success": False, "resposta": str(e)}

# ── WEBHOOK RECEBIMENTO DO WHATSAPP (BRIDGE) ──────────────────────────────────
class MensagemRecebida(BaseModel):
    telefone: str
    texto: str
    nome: Optional[str] = None

@app.post("/webhook/whatsapp")
async def webhook_whatsapp(msg: MensagemRecebida, background_tasks: BackgroundTasks):
    tel = normalizar_telefone_wpp(msg.telefone)
    res_flow = flow_engine.processar_mensagem(tel, msg.texto, msg.nome)

    if not res_flow.get("bot_ativo", True):
        return {"status": "paused"}

    resp_texto = res_flow.get("resposta")
    if resp_texto:
        def disparar():
            try:
                requests.post(f"{NODE_BRIDGE_URL}/send", json={
                    "telefone": tel,
                    "mensagem": resp_texto,
                    "delay_segundos": 2,
                    "simular_digitando": True
                }, timeout=10)
            except Exception as e:
                print(f"[Webhook WA] Erro ao responder {tel}: {e}")
        background_tasks.add_task(disparar)

    return {"status": "ok", "acao": res_flow.get("acao")}
