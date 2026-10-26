import json
import os
import re
import time
from typing import Dict, Any, Optional

CONFIG_FILE = "config.json"
LEADS_FILE = "leads.json"
SESSOES_FILE = "sessoes.json"

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
        print(f"[Flow] Erro ao salvar {caminho}: {e}")

class FlowEngine:
    """
    Motor de funis focado em Vendas e Qualificação de Cursos Online (Hotmart / ManyChat Style).
    Suporta tags de delay dinâmico: ---delay:X---
    """
    def __init__(self):
        pass

    def obter_sessao(self, telefone: str) -> Dict[str, Any]:
        sessoes = carregar_json(SESSOES_FILE, {})
        if telefone not in sessoes:
            sessoes[telefone] = {
                "funil_ativo": None,
                "etapa_atual": None,
                "dados_coletados": {},
                "bot_ativo": True,
                "ultima_interacao": int(time.time())
            }
            salvar_json(SESSOES_FILE, sessoes)
        return sessoes[telefone]

    def atualizar_sessao(self, telefone: str, dados: Dict[str, Any]) -> None:
        sessoes = carregar_json(SESSOES_FILE, {})
        if telefone not in sessoes:
            sessoes[telefone] = {}
        sessoes[telefone].update(dados)
        sessoes[telefone]["ultima_interacao"] = int(time.time())
        salvar_json(SESSOES_FILE, sessoes)

    def processar_mensagem(self, telefone: str, texto: str, nome: Optional[str] = None) -> Dict[str, Any]:
        """
        Retorna dicionário no formato:
        {
            "resposta": str (com possíveis tags ---delay:X---),
            "acao": "CONTINUAR" | "HUMANO" | "IGNORAR" | "FINALIZADO",
            "bot_ativo": bool
        }
        """
        sessao = self.obter_sessao(telefone)
        if not sessao.get("bot_ativo", True):
            return {"resposta": "", "acao": "HUMANO", "bot_ativo": False}

        cfg = carregar_json(CONFIG_FILE, {})
        texto_limpo = texto.strip().lower()

        # 1. Checagem de gatilhos manuais ou palavras-chave
        gatilhos = cfg.get("gatilhos_custom", {})
        for gatilho_k, g_info in gatilhos.items():
            if gatilho_k.lower() in texto_limpo:
                tipo = g_info.get("tipo")
                if tipo == "HUMANO":
                    self.atualizar_sessao(telefone, {"bot_ativo": False, "funil_ativo": None, "etapa_atual": None})
                    return {
                        "resposta": "Entendido! Estou transferindo seu atendimento para nossa equipe humana. Aguarde um momento por favor! 👤",
                        "acao": "HUMANO",
                        "bot_ativo": False
                    }
                elif tipo == "INICIAR_FUNIL":
                    funil_id = g_info.get("funil_id", "venda_curso")
                    return self._iniciar_funil(telefone, funil_id, cfg, nome)

        # 2. Se já estiver no meio de um funil ativo
        funil_ativo = sessao.get("funil_ativo")
        etapa_atual_id = sessao.get("etapa_atual")
        if funil_ativo and etapa_atual_id:
            funis = cfg.get("funis", {})
            funil_obj = funis.get(funil_ativo)
            if funil_obj:
                return self._avancar_etapa(telefone, funil_obj, etapa_atual_id, texto, cfg, nome)

        # 3. Mensagem padrão se não houver funil em andamento
        # Inicia funil de qualificação de curso
        return self._iniciar_funil(telefone, "venda_curso", cfg, nome)

    def _iniciar_funil(self, telefone: str, funil_id: str, cfg: Dict[str, Any], nome: Optional[str] = None) -> Dict[str, Any]:
        funis = cfg.get("funis", {})
        funil_obj = funis.get(funil_id)
        if not funil_obj:
            return {"resposta": "", "acao": "IGNORAR", "bot_ativo": True}

        etapas = funil_obj.get("etapas", [])
        if not etapas:
            return {"resposta": "", "acao": "IGNORAR", "bot_ativo": True}

        primeira_etapa = etapas[0]
        self.atualizar_sessao(telefone, {
            "funil_ativo": funil_id,
            "etapa_atual": primeira_etapa.get("id"),
            "dados_coletados": {"nome": nome or "Futuro Aluno"}
        })

        msg_formatada = self._formatar_variaveis(primeira_etapa.get("mensagem", ""), cfg, nome)
        return {
            "resposta": msg_formatada,
            "acao": "CONTINUAR",
            "bot_ativo": True
        }

    def _avancar_etapa(self, telefone: str, funil_obj: Dict[str, Any], etapa_id: str, resposta_usuario: str, cfg: Dict[str, Any], nome: Optional[str]) -> Dict[str, Any]:
        etapas = funil_obj.get("etapas", [])
        etapa_atual = next((e for e in etapas if e.get("id") == etapa_id), None)
        if not etapa_atual:
            self.atualizar_sessao(telefone, {"funil_ativo": None, "etapa_atual": None})
            return {"resposta": "", "acao": "FINALIZADO", "bot_ativo": True}

        # Salva o campo coletado
        sessao = self.obter_sessao(telefone)
        coletados = sessao.get("dados_coletados", {})
        campo_salvar = etapa_atual.get("campo_salvar")
        if campo_salvar:
            coletados[campo_salvar] = resposta_usuario.strip()

        proxima_id = etapa_atual.get("proxima_etapa")
        if not proxima_id:
            # Fim do funil
            self.atualizar_sessao(telefone, {"funil_ativo": None, "etapa_atual": None, "dados_coletados": coletados})
            return {"resposta": "", "acao": "FINALIZADO", "bot_ativo": True}

        proxima_etapa = next((e for e in etapas if e.get("id") == proxima_id), None)
        if not proxima_etapa:
            self.atualizar_sessao(telefone, {"funil_ativo": None, "etapa_atual": None, "dados_coletados": coletados})
            return {"resposta": "", "acao": "FINALIZADO", "bot_ativo": True}

        # Avança para a próxima etapa
        self.atualizar_sessao(telefone, {
            "etapa_atual": proxima_id,
            "dados_coletados": coletados
        })

        msg_formatada = self._formatar_variaveis(proxima_etapa.get("mensagem", ""), cfg, nome or coletados.get("nome"))
        return {
            "resposta": msg_formatada,
            "acao": "CONTINUAR",
            "bot_ativo": True
        }

    def _formatar_variaveis(self, texto: str, cfg: Dict[str, Any], nome: Optional[str] = None) -> str:
        hotmart_cfg = cfg.get("hotmart", {})
        link_checkout = hotmart_cfg.get("link_checkout", "")
        link_acesso = hotmart_cfg.get("link_acesso", "https://app-vlc.hotmart.com/login")
        prod = hotmart_cfg.get("produto_padrao", "Curso Online")

        return texto.replace("{nome}", nome or "Futuro Aluno") \
                    .replace("{produto}", prod) \
                    .replace("{link_checkout}", link_checkout) \
                    .replace("{link_acesso}", link_acesso) \
                    .replace("{codigo_pix}", "Solicite o código atualizado no chat")
