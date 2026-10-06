// Leitura e gravação do agua.json pela API de Contents do GitHub.

const DONO = 'SamuelAraag';
const REPO = 'emagrecimento';
const BRANCH = 'agua-dados';
const ARQUIVO = 'agua.json';

const URL_ARQUIVO = `https://api.github.com/repos/${DONO}/${REPO}/contents/${ARQUIVO}`;
const CHAVE_TOKEN = 'beba-agua.token';

export const REPO_DADOS = `${DONO}/${REPO}`;
export const BRANCH_DADOS = BRANCH;

// tipo: 'token' | 'permissao' | 'ausente' | 'conflito' | 'rede' | 'servidor'
export class ErroGitHub extends Error {
  constructor(tipo, mensagem) {
    super(mensagem);
    this.name = 'ErroGitHub';
    this.tipo = tipo;
  }
}

export function lerToken() {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export function salvarToken(token) {
  localStorage.setItem(CHAVE_TOKEN, token);
}

export function apagarToken() {
  localStorage.removeItem(CHAVE_TOKEN);
}

function decodificar(base64) {
  const binario = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function codificar(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

async function requisitar(url, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(url, {
      ...opcoes,
      // O GET de Contents vem com max-age=60; sem isso a releitura do 409 devolveria o sha velho.
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${lerToken()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...opcoes.headers,
      },
    });
  } catch {
    throw new ErroGitHub('rede', 'Sem conexão com o GitHub. Confira a internet e tente de novo.');
  }

  if (resposta.ok) return resposta.json();

  switch (resposta.status) {
    case 401:
      throw new ErroGitHub('token', 'Token inválido ou expirado. Gere um novo token e cole de novo.');
    case 403:
      throw new ErroGitHub(
        'permissao',
        'O GitHub recusou o acesso. Confira se o token tem a permissão Contents: Read and write, ou espere alguns minutos se o limite de requisições estourou.',
      );
    case 404:
      throw new ErroGitHub(
        'ausente',
        `Não achei o ${ARQUIVO} na branch ${BRANCH} de ${REPO_DADOS}. Confira se a branch existe e se o token tem acesso a esse repositório.`,
      );
    case 409:
      throw new ErroGitHub('conflito', 'Outro aparelho gravou antes.');
    default:
      throw new ErroGitHub('servidor', `O GitHub respondeu com erro ${resposta.status}. Tente de novo em instantes.`);
  }
}

export async function ler() {
  const json = await requisitar(`${URL_ARQUIVO}?ref=${encodeURIComponent(BRANCH)}`);
  let dados;
  try {
    dados = JSON.parse(decodificar(json.content));
  } catch {
    throw new ErroGitHub('servidor', `O ${ARQUIVO} da branch ${BRANCH} não é um JSON válido. Corrija o arquivo no GitHub.`);
  }
  return { dados, sha: json.sha };
}

export async function gravar(dados, sha, mensagem) {
  const json = await requisitar(URL_ARQUIVO, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: mensagem,
      content: codificar(`${JSON.stringify(dados, null, 2)}\n`),
      sha,
      branch: BRANCH,
    }),
  });
  return json.content.sha;
}
