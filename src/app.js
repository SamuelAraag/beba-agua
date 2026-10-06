// Estado, regras e eventos.

import * as github from './github.js';
import * as ui from './ui.js';

const PASSO_ML = 500;
const META_PADRAO_ML = 2000;
const META_MIN_ML = 500;
const META_MAX_ML = 10000;
const MAX_REAPLICACOES = 3;

// O dia é fixado no carregamento: para virar o dia, recarrega a página.
const HOJE = ui.chaveDia(new Date());

let confirmado = null; // último estado que o GitHub confirmou
let sha = null;
let emVoo = null; // delta sendo gravado agora
let pendente = null; // delta acumulado esperando a vez
let falha = null; // delta que não gravou, aguardando "tentar de novo"
let gravando = false;
let rascunhoMeta = null; // valor na tela de meta; nulo quando ela está fechada

// Um delta é { ml, meta }: ml soma ao dia de hoje, meta (se não nula) troca a meta.
function somarDeltas(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { ml: a.ml + b.ml, meta: b.meta ?? a.meta };
}

function deltaVazio(delta) {
  return !delta || (delta.ml === 0 && delta.meta == null);
}

function aplicar(dados, delta) {
  if (deltaVazio(delta)) return dados;
  const novo = { ...dados, dias: { ...dados.dias } };
  if (delta.meta != null) novo.meta_ml = delta.meta;
  const dia = { ml: 0, meta_ml: novo.meta_ml, ...novo.dias[HOJE] };
  if (delta.meta != null) dia.meta_ml = delta.meta;
  dia.ml = Math.max(0, dia.ml + delta.ml);
  novo.dias[HOJE] = dia;
  return novo;
}

function normalizar(dados) {
  const base = dados && typeof dados === 'object' ? dados : {};
  return {
    ...base,
    versao: base.versao ?? 1,
    meta_ml: Number.isFinite(base.meta_ml) ? base.meta_ml : null,
    dias: base.dias && typeof base.dias === 'object' ? base.dias : {},
  };
}

function visao() {
  return aplicar(aplicar(confirmado, emVoo), pendente);
}

function mensagemDeCommit(delta) {
  const partes = [];
  if (delta.meta != null) partes.push(`meta ${delta.meta} ml`);
  if (delta.ml !== 0) partes.push(`${delta.ml > 0 ? '+' : ''}${delta.ml} ml`);
  return `agua: ${partes.join(', ')} (${HOJE})`;
}

function descrever(delta) {
  const partes = [];
  if (delta.meta != null) partes.push(`a meta de ${ui.fmtLitros(delta.meta)}`);
  if (delta.ml !== 0) partes.push(`${delta.ml > 0 ? '+' : '-'}${ui.fmtMl(Math.abs(delta.ml))}`);
  return partes.join(' e ');
}

function render() {
  if (!confirmado) return;
  const dados = visao();
  if (rascunhoMeta == null && dados.meta_ml == null) rascunhoMeta = META_PADRAO_ML;
  if (rascunhoMeta != null) {
    ui.renderMeta(rascunhoMeta, {
      podeCancelar: dados.meta_ml != null,
      min: META_MIN_ML,
      max: META_MAX_ML,
    });
    ui.mostrarTela('meta');
    return;
  }
  ui.renderPrincipal(dados, HOJE, { gravando });
  ui.mostrarTela('principal');
}

function enfileirar(delta) {
  pendente = somarDeltas(pendente, delta);
  render();
  bombear();
}

// Fila única: um PUT por vez. Toques durante a gravação acumulam em `pendente`.
async function bombear() {
  if (gravando) return;
  gravando = true;
  while (pendente) {
    emVoo = pendente;
    pendente = null;
    if (deltaVazio(emVoo)) {
      emVoo = null;
      continue;
    }
    render();
    try {
      await gravarComReaplicacao(emVoo);
      emVoo = null;
    } catch (erro) {
      const perdido = somarDeltas(emVoo, pendente);
      emVoo = null;
      pendente = null;
      gravando = false;
      render();
      avisarFalha(perdido, erro);
      return;
    }
  }
  gravando = false;
  render();
}

// No 409 o sha local está velho: relê, reaplica o delta sobre o remoto e tenta de novo.
async function gravarComReaplicacao(delta) {
  for (let reaplicacoes = 0; ; reaplicacoes++) {
    const novo = aplicar(confirmado, delta);
    try {
      sha = await github.gravar(novo, sha, mensagemDeCommit(delta));
      confirmado = novo;
      return;
    } catch (erro) {
      if (erro.tipo !== 'conflito' || reaplicacoes >= MAX_REAPLICACOES) throw erro;
      const remoto = await github.ler();
      confirmado = normalizar(remoto.dados);
      sha = remoto.sha;
    }
  }
}

function avisarFalha(delta, erro) {
  falha = somarDeltas(falha, delta);
  if (erro.tipo === 'token') {
    github.apagarToken();
    ui.abrirLogin(erro.message);
  }
  if (deltaVazio(falha)) {
    falha = null;
    return;
  }
  const motivo = erro.tipo === 'conflito' ? 'Outro aparelho está gravando ao mesmo tempo.' : erro.message;
  ui.mostrarAviso(`Não deu para salvar ${descrever(falha)}. ${motivo}`, 'Tentar de novo', () => {
    const delta = falha;
    falha = null;
    ui.esconderAviso();
    enfileirar(delta);
  });
}

async function carregar() {
  ui.mostrarTela('carregando');
  try {
    const remoto = await github.ler();
    confirmado = normalizar(remoto.dados);
    sha = remoto.sha;
    render();
  } catch (erro) {
    if (erro.tipo === 'token') {
      github.apagarToken();
      ui.abrirLogin(erro.message);
      return;
    }
    ui.renderErro(erro.message);
    ui.mostrarTela('erro');
  }
}

async function entrar(token) {
  if (!token) {
    ui.erroNoLogin('Cole o token para entrar.');
    return;
  }
  github.salvarToken(token);
  ui.loginOcupado(true);
  try {
    const remoto = await github.ler();
    confirmado = normalizar(remoto.dados);
    sha = remoto.sha;
    ui.fecharLogin();
    render();
  } catch (erro) {
    if (erro.tipo === 'token') github.apagarToken();
    ui.erroNoLogin(erro.message);
  } finally {
    ui.loginOcupado(false);
  }
}

function sair() {
  github.apagarToken();
  confirmado = null;
  sha = null;
  rascunhoMeta = null;
  falha = null;
  ui.esconderAviso();
  ui.mostrarTela(null);
  ui.abrirLogin();
}

function ajustarRascunho(ml) {
  rascunhoMeta = Math.min(META_MAX_ML, Math.max(META_MIN_ML, ml));
  render();
}

ui.ligarEventos({
  somar: () => enfileirar({ ml: PASSO_ML, meta: null }),
  desfazer: () => {
    if ((visao().dias[HOJE]?.ml ?? 0) > 0) enfileirar({ ml: -PASSO_ML, meta: null });
  },
  abrirMeta: () => {
    rascunhoMeta = visao().meta_ml ?? META_PADRAO_ML;
    render();
    ui.focarTela('meta');
  },
  escolherMeta: (ml) => ajustarRascunho(ml),
  ajustarMeta: (sentido) => ajustarRascunho(rascunhoMeta + sentido * PASSO_ML),
  salvarMeta: () => {
    const meta = rascunhoMeta;
    const mudou = meta !== visao().meta_ml;
    rascunhoMeta = null;
    if (mudou) enfileirar({ ml: 0, meta });
    else render();
    ui.focarTela('principal');
  },
  cancelarMeta: () => {
    rascunhoMeta = null;
    render();
    ui.focarTela('principal');
  },
  entrar,
  sair,
  recarregar: carregar,
  trocarToken: () => ui.abrirLogin(),
});

if (github.lerToken()) carregar();
else {
  ui.mostrarTela(null);
  ui.abrirLogin();
}
