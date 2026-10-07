// Estado, regras e eventos.

import * as github from './github.js';
import * as ui from './ui.js';

const PASSO_ML = 500;
const META_PADRAO_ML = 2000;
const META_MIN_ML = 500;
const META_MAX_ML = 10000;
const MAX_REAPLICACOES = 3;
const INTERVALO_ATIVO_MS = 5 * 60 * 1000; // tela visível e com foco
const INTERVALO_INATIVO_MS = 15 * 60 * 1000; // tela oculta ou sem foco

// Recalculado a cada releitura e a cada toque, para a tela aberta virar o dia sozinha.
let hoje = ui.chaveDia(new Date());

let confirmado = null; // último estado que o GitHub confirmou
let sha = null;
let emVoo = null; // delta sendo gravado agora
let pendente = null; // delta acumulado esperando a vez
let falha = null; // delta que não gravou, aguardando "tentar de novo"
let gravando = false;
let fila = Promise.resolve(); // termina quando não há mais nada para gravar
let sincronia = null; // { evento: 'salvo' | 'lido', quando } da última troca com o GitHub que deu certo
let atualizandoAgora = false; // releitura pedida pela pessoa em andamento
let rascunhoMeta = null; // valor na tela de meta; nulo quando ela está fechada
let atualizando = false; // releitura periódica em andamento
let ultimaTentativa = Date.now(); // última leitura do remoto, com sucesso ou não
let temporizador = null;

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
  const dia = { ml: 0, meta_ml: novo.meta_ml, ...novo.dias[hoje] };
  if (delta.meta != null) dia.meta_ml = delta.meta;
  dia.ml = Math.max(0, dia.ml + delta.ml);
  novo.dias[hoje] = dia;
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
  return `agua: ${partes.join(', ')} (${hoje})`;
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
  ui.renderPrincipal(dados, hoje, { gravando, sincronia });
  ui.mostrarTela('principal');
}

function marcarSincronia(evento) {
  sincronia = { evento, quando: new Date() };
  // Sincronizou: um aviso de "não deu para atualizar" ficou velho. O de falha ao salvar fica.
  if (!falha) ui.esconderAviso();
}

// Só vira o dia com a fila vazia: um delta em andamento pertence ao dia em que foi tocado.
function virarDia() {
  if (gravando || pendente || falha) return false;
  const agora = ui.chaveDia(new Date());
  if (agora === hoje) return false;
  hoje = agora;
  return true;
}

function enfileirar(delta) {
  virarDia();
  pendente = somarDeltas(pendente, delta);
  render();
  if (!gravando) fila = bombear();
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
      marcarSincronia('salvo');
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

function podeAtualizar() {
  return Boolean(confirmado && github.lerToken()) && !gravando && !pendente && !falha;
}

// Releitura silenciosa: cede a vez a qualquer gravação e só redesenha se algo mudou.
async function atualizar() {
  ultimaTentativa = Date.now();
  if (atualizando || !podeAtualizar()) return;
  atualizando = true;
  const shaAntes = sha;
  try {
    if (virarDia()) render();
    const remoto = await github.ler();
    // Um toque ou logout durante a leitura deixa o que veio velho: descarta.
    if (!podeAtualizar() || sha !== shaAntes) return;
    if (remoto.sha !== sha) {
      confirmado = normalizar(remoto.dados);
      sha = remoto.sha;
    }
    marcarSincronia('lido');
    render();
  } catch (erro) {
    // Rede e servidor ficam em silêncio: o próximo ciclo tenta de novo.
    if (erro.tipo === 'token' && github.lerToken()) {
      github.apagarToken();
      ui.abrirLogin(erro.message);
    }
  } finally {
    atualizando = false;
  }
}

// Releitura pedida pela pessoa (puxar a tela ou botão "Atualizar"). Diferente da
// silenciosa, espera a fila de gravação e avisa na tela se não der certo.
async function atualizarAgora() {
  if (atualizandoAgora) return;
  if (!confirmado) {
    if (github.lerToken()) await carregar();
    return;
  }
  atualizandoAgora = true;
  ui.atualizarOcupado(true);
  try {
    await fila;
    if (falha) return; // o aviso da falha ao salvar já está na tela
    virarDia();
    const shaAntes = sha;
    const remoto = await github.ler();
    ultimaTentativa = Date.now();
    // Um toque ou logout durante a leitura deixa o que veio velho: a gravação já sincroniza.
    if (!confirmado || gravando || pendente || sha !== shaAntes) return;
    confirmado = normalizar(remoto.dados);
    sha = remoto.sha;
    marcarSincronia('lido');
  } catch (erro) {
    if (erro.tipo === 'token') {
      github.apagarToken();
      ui.abrirLogin(erro.message);
    } else if (!falha) {
      ui.mostrarAviso(`Não deu para atualizar. ${erro.message}`, 'Tentar de novo', () => {
        ui.esconderAviso();
        atualizarAgora();
      });
    }
  } finally {
    atualizandoAgora = false;
    ui.atualizarOcupado(false);
    render();
    agendar();
  }
}

function telaAtiva() {
  return !document.hidden && document.hasFocus();
}

function agendar() {
  clearTimeout(temporizador);
  const intervalo = telaAtiva() ? INTERVALO_ATIVO_MS : INTERVALO_INATIVO_MS;
  const espera = Math.max(0, ultimaTentativa + intervalo - Date.now());
  temporizador = setTimeout(async () => {
    await atualizar();
    agendar();
  }, espera);
}

// Voltar para a tela sempre relê na hora: é quando se quer ver o que outro aparelho gravou,
// e aba em segundo plano tem o timer congelado pelo navegador.
function aoMudarAtividade() {
  if (telaAtiva()) atualizar();
  agendar();
}

async function carregar() {
  ui.mostrarTela('carregando');
  try {
    const remoto = await github.ler();
    confirmado = normalizar(remoto.dados);
    sha = remoto.sha;
    ultimaTentativa = Date.now();
    marcarSincronia('lido');
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
    ultimaTentativa = Date.now();
    marcarSincronia('lido');
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
  sincronia = null;
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
    if ((visao().dias[hoje]?.ml ?? 0) > 0) enfileirar({ ml: -PASSO_ML, meta: null });
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
  atualizar: atualizarAgora,
  puxar: atualizarAgora,
  trocarToken: () => ui.abrirLogin(),
});

document.addEventListener('visibilitychange', aoMudarAtividade);
window.addEventListener('focus', aoMudarAtividade);
window.addEventListener('blur', aoMudarAtividade);
agendar();

if (github.lerToken()) carregar();
else {
  ui.mostrarTela(null);
  ui.abrirLogin();
}
