// Render dos anéis, telas e histórico. Não guarda estado de negócio.

import { REPO_DADOS, lerToken } from './github.js';

const SVG = 'http://www.w3.org/2000/svg';
const ATALHOS_ML = [1000, 1500, 2000, 2500, 3000, 3500];
const DIAS_TRAJETORIA = 30;
const INICIAIS_SEMANA = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const LIMIAR_PUXAR = 64;
const MAX_PUXAR = 96;

const $ = (id) => document.getElementById(id);

const TELAS = ['carregando', 'erro', 'meta', 'principal'];

// Data local, nunca toISOString(): em UTC o dia vira às 21h no Brasil.
export function chaveDia(data) {
  const p = (n) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`;
}

function dataDaChave(chave) {
  const [ano, mes, dia] = chave.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

function somarDias(data, n) {
  const d = new Date(data);
  d.setDate(d.getDate() + n);
  return d;
}

export const fmtMl = (ml) => `${ml.toLocaleString('pt-BR')} ml`;
export const fmtLitros = (ml) => `${(ml / 1000).toLocaleString('pt-BR')} L`;

function el(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto != null) no.textContent = texto;
  return no;
}

function svg(tag, atributos) {
  const no = document.createElementNS(SVG, tag);
  for (const [nome, valor] of Object.entries(atributos)) no.setAttribute(nome, valor);
  return no;
}

function proporcao(ml, meta) {
  return meta > 0 ? ml / meta : 0;
}

// Anel: trilho, arco de progresso (fecha em 100%) e arco de excedente, que dá a
// segunda volta por cima. pathLength=100 deixa o offset direto em porcentagem.
function criarAnel(comCheck) {
  const raiz = svg('svg', { viewBox: '0 0 100 100', class: 'anel', 'aria-hidden': 'true' });
  const circulo = (classe) => svg('circle', { cx: 50, cy: 50, r: 42, pathLength: 100, class: classe });
  raiz.append(circulo('anel__trilho'), circulo('anel__arco anel__progresso'), circulo('anel__arco anel__excesso'));
  if (comCheck) raiz.append(svg('path', { d: 'M36 51l10 10 19-21', class: 'anel__check' }));
  return raiz;
}

function atualizarAnel(anel, ml, meta) {
  const p = proporcao(ml, meta);
  anel.classList.toggle('anel--completo', p >= 1);
  const arcos = [
    [anel.querySelector('.anel__progresso'), Math.min(p, 1)],
    [anel.querySelector('.anel__excesso'), Math.min(Math.max(p - 1, 0), 1)],
  ];
  for (const [arco, fracao] of arcos) {
    arco.style.strokeDashoffset = 100 - fracao * 100;
    // Arco vazio com ponta redonda ainda desenha um ponto; some com ele.
    arco.classList.toggle('anel__arco--vazio', fracao === 0);
  }
}

function resumo(ml, meta) {
  const pct = Math.round(proporcao(ml, meta) * 100);
  if (ml > meta) return `+${fmtMl(ml - meta)} acima da meta, ${pct}%`;
  if (ml === meta) return 'Meta batida, 100%';
  return `${pct}% da meta`;
}

const anelHoje = criarAnel(false);
$('anel-hoje').append(anelHoje);
$('login-repo').textContent = REPO_DADOS;

for (const ml of ATALHOS_ML) {
  const botao = el('button', 'botao botao--chip', fmtLitros(ml));
  botao.type = 'button';
  botao.dataset.ml = ml;
  $('meta-atalhos').append(botao);
}

export function mostrarTela(nome) {
  for (const tela of TELAS) $(`tela-${tela}`).hidden = tela !== nome;
  $('sair').hidden = !lerToken();
}

export function focarTela(nome) {
  $(`tela-${nome}`).querySelector('h2').focus();
}

export function renderErro(mensagem) {
  $('erro-mensagem').textContent = mensagem;
}

export function renderMeta(valor, { podeCancelar, min, max }) {
  $('meta-valor').textContent = fmtLitros(valor);
  $('meta-menos').disabled = valor <= min;
  $('meta-mais').disabled = valor >= max;
  $('meta-cancelar').hidden = !podeCancelar;
  for (const botao of $('meta-atalhos').children) {
    botao.setAttribute('aria-pressed', String(Number(botao.dataset.ml) === valor));
  }
}

export function renderPrincipal(dados, hoje, { gravando }) {
  const dia = dados.dias[hoje] ?? { ml: 0, meta_ml: dados.meta_ml };
  const meta = dia.meta_ml ?? dados.meta_ml;

  atualizarAnel(anelHoje, dia.ml, meta);
  $('hoje-check').toggleAttribute('hidden', dia.ml < meta); // SVG não tem a propriedade hidden
  $('hoje-ml').textContent = fmtMl(dia.ml);
  $('hoje-meta').textContent = `Meta: ${fmtLitros(meta)}`;
  $('hoje-meta').setAttribute('aria-label', `Meta: ${fmtLitros(meta)}. Editar meta`);
  $('hoje-resumo').textContent = resumo(dia.ml, meta);
  $('hoje-resumo').classList.toggle('hoje__resumo--batida', dia.ml === meta);
  $('hoje-resumo').classList.toggle('hoje__resumo--excesso', dia.ml > meta);
  $('desfazer').hidden = dia.ml <= 0;
  $('gravacao').textContent = gravando ? 'Salvando...' : '';

  renderSemana(dados, hoje);
  renderTrajetoria(dados, hoje);
}

function renderSemana(dados, hoje) {
  const dataHoje = dataDaChave(hoje);
  const segunda = somarDias(dataHoje, -((dataHoje.getDay() + 6) % 7));
  const itens = INICIAIS_SEMANA.map((inicial, i) => {
    const data = somarDias(segunda, i);
    const chave = chaveDia(data);
    const dia = dados.dias[chave];
    const ml = dia?.ml ?? 0;
    const meta = dia?.meta_ml ?? dados.meta_ml;

    const item = el('li', 'semana__dia');
    if (chave === hoje) {
      item.classList.add('semana__dia--hoje');
      item.setAttribute('aria-current', 'date');
    }
    if (chave > hoje) item.classList.add('semana__dia--futuro');
    const anel = criarAnel(true);
    atualizarAnel(anel, ml, meta);
    const nome = data.toLocaleDateString('pt-BR', { weekday: 'long' });
    item.append(anel, el('span', 'semana__inicial', inicial));
    item.querySelector('.semana__inicial').setAttribute('aria-hidden', 'true');
    item.append(el('span', 'so-leitor', chave > hoje ? nome : `${nome}: ${fmtMl(ml)}, ${resumo(ml, meta)}`));
    return item;
  });
  $('semana').replaceChildren(...itens);
}

function renderTrajetoria(dados, hoje) {
  const dataHoje = dataDaChave(hoje);
  const janela = [];
  for (let i = 0; i < DIAS_TRAJETORIA; i++) janela.push(chaveDia(somarDias(dataHoje, -i)));

  // Da data mais antiga com registro até hoje, para os dias pulados aparecerem zerados.
  let ultimo = -1;
  janela.forEach((chave, i) => {
    if ((dados.dias[chave]?.ml ?? 0) > 0) ultimo = i;
  });

  const linhas = janela.slice(0, ultimo + 1).map((chave) => {
    const dia = dados.dias[chave];
    const ml = dia?.ml ?? 0;
    const meta = dia?.meta_ml ?? dados.meta_ml;
    const escala = Math.max(ml, meta) || 1;

    const linha = el('li', 'trajetoria__linha');
    const rotulo =
      chave === hoje
        ? 'hoje'
        : dataDaChave(chave).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');

    const barra = el('div', 'barra');
    barra.setAttribute('aria-hidden', 'true');
    barra.classList.toggle('barra--completa', ml >= meta);
    const consumo = el('span', 'barra__consumo');
    consumo.style.width = `${(Math.min(ml, meta) / escala) * 100}%`;
    barra.append(consumo);
    if (ml > meta) {
      const excesso = el('span', 'barra__excesso');
      excesso.style.width = `${((ml - meta) / escala) * 100}%`;
      barra.append(excesso);
    }

    const valor = el('span', 'trajetoria__valor', fmtMl(ml));
    const pct = el('span', 'trajetoria__pct', `${ml >= meta ? '✓ ' : ''}${Math.round(proporcao(ml, meta) * 100)}%`);
    linha.append(el('span', 'trajetoria__data', rotulo), barra, valor, pct);
    return linha;
  });

  $('trajetoria-lista').replaceChildren(...linhas);
  $('trajetoria-vazia').hidden = linhas.length > 0;
}

let acaoDoAviso = null;

export function mostrarAviso(texto, rotuloAcao, acao) {
  $('aviso-texto').textContent = texto;
  $('aviso-acao').textContent = rotuloAcao;
  acaoDoAviso = acao;
  $('aviso').hidden = false;
}

export function esconderAviso() {
  $('aviso').hidden = true;
  acaoDoAviso = null;
}

export function abrirLogin(mensagem) {
  const dialogo = $('login');
  $('login-cancelar').hidden = !lerToken();
  $('login-token').value = '';
  erroNoLogin(mensagem ?? null);
  if (!dialogo.open) dialogo.showModal();
  $('login-token').focus();
}

export function fecharLogin() {
  $('login').close();
}

export function erroNoLogin(mensagem) {
  const erro = $('login-erro');
  erro.hidden = !mensagem;
  erro.textContent = mensagem ?? '';
  $('login-token').setAttribute('aria-invalid', String(Boolean(mensagem)));
}

export function loginOcupado(ocupado) {
  $('login-entrar').disabled = ocupado;
  $('login-entrar').textContent = ocupado ? 'Verificando...' : 'Entrar';
}

// Puxar para recarregar, como nos apps do iPhone: no topo da página, arrasta para
// baixo e solta. O conteúdo desce junto com o dedo e o girador aparece no vão.
function ligarPuxar(aoSoltar) {
  const raiz = document.documentElement;
  let inicio = null;
  let distancia = 0;
  let recarregando = false;

  const definir = (px) => {
    distancia = px;
    raiz.style.setProperty('--puxar', `${px}px`);
    $('puxar').classList.toggle('puxar--armado', px >= LIMIAR_PUXAR);
  };

  addEventListener(
    'touchstart',
    (evento) => {
      const podePuxar = !recarregando && evento.touches.length === 1 && scrollY <= 0 && !$('login').open;
      inicio = podePuxar ? evento.touches[0].clientY : null;
      raiz.classList.remove('puxar-soltando');
    },
    { passive: true },
  );

  addEventListener(
    'touchmove',
    (evento) => {
      if (inicio == null) return;
      const arrasto = evento.touches[0].clientY - inicio;
      if (arrasto <= 0 || scrollY > 0) {
        if (distancia) definir(0);
        return;
      }
      // Segura o elástico nativo para o conteúdo seguir só o nosso deslocamento.
      if (evento.cancelable) evento.preventDefault();
      definir(Math.min(arrasto / 2, MAX_PUXAR));
    },
    { passive: false },
  );

  addEventListener('touchend', () => {
    if (inicio == null) return;
    inicio = null;
    raiz.classList.add('puxar-soltando');
    if (distancia < LIMIAR_PUXAR) {
      definir(0);
      return;
    }
    recarregando = true;
    definir(LIMIAR_PUXAR);
    $('puxar').classList.add('puxar--recarregando');
    aoSoltar();
  });

  addEventListener('touchcancel', () => {
    inicio = null;
    if (!recarregando) definir(0);
  });
}

export function ligarEventos(acoes) {
  ligarPuxar(acoes.puxar);
  $('somar').addEventListener('click', acoes.somar);
  $('desfazer').addEventListener('click', acoes.desfazer);
  $('hoje-meta').addEventListener('click', acoes.abrirMeta);
  $('meta-atalhos').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button');
    if (botao) acoes.escolherMeta(Number(botao.dataset.ml));
  });
  $('meta-menos').addEventListener('click', () => acoes.ajustarMeta(-1));
  $('meta-mais').addEventListener('click', () => acoes.ajustarMeta(1));
  $('meta-salvar').addEventListener('click', acoes.salvarMeta);
  $('meta-cancelar').addEventListener('click', acoes.cancelarMeta);
  $('sair').addEventListener('click', acoes.sair);
  $('erro-recarregar').addEventListener('click', acoes.recarregar);
  $('erro-trocar-token').addEventListener('click', acoes.trocarToken);
  $('aviso-acao').addEventListener('click', () => acaoDoAviso?.());
  $('login-form').addEventListener('submit', (evento) => {
    evento.preventDefault();
    acoes.entrar($('login-token').value.trim());
  });
  $('login-cancelar').addEventListener('click', fecharLogin);
  // Sem token não há nada atrás do modal: Esc não fecha.
  $('login').addEventListener('cancel', (evento) => {
    if (!lerToken()) evento.preventDefault();
  });
}
