# Plano: Beba Água (HTML + JSON no GitHub)

## Contexto

Site estático, mais simples que apps como o Hydro Coach: define a meta
diária uma vez (editável depois), e no dia a dia só aperta um botão que soma 500 ml à cota
de hoje. O anel fecha ao bater a meta e continua medindo se passar, com indicador de
ultrapassagem. Uma faixa mostra a trajetória dos dias.

Persistência no mesmo modelo do ToDo-List (`SamuelAraag/ToDo-List`): JSON versionado numa
branch, lido e gravado pela API de Contents do GitHub, login com token pessoal.

Decisões já tomadas:
- Nome: **Beba Água**, repo `SamuelAraag/beba-agua`.
- Código num repo **privado**. Fica privado por enquanto.
- Dados no repo privado de saúde (`SamuelAraag/emagrecimento`), branch órfã `agua-dados`.

## O que a análise do ToDo-List mostrou

O que funciona e será mantido:
- `GET /contents/{arquivo}?ref={branch}` devolve conteúdo + `sha`; `PUT` com esse `sha` e
  `branch` grava um commit. O `sha` é trava otimista: se outro aparelho gravou antes, o
  GitHub responde 409 (`src/apiService.js:24-100`).
- Branch de dados separada da `main`: o deploy do Pages só roda em push na `main`
  (`.github/workflows/static.yml:6-7`), então gravar tarefa não redeploya o site.

Problemas encontrados, que o app novo evita:
1. **409 perde a alteração em silêncio.** `saveTasks` devolve `newSha: null` e
   `saveTask` não faz nada (`src/script.js:24-31`); o próximo poll sobrescreve o estado
   local com o remoto.
2. **Conflito decidido por relógio do cliente** (`last_updated`, `src/script.js:59-65`)
   em vez do `sha`. Relógios diferentes entre aparelhos quebram a comparação.
3. **Polling a cada 3 s** (`src/script.js:38-40`): 1.200 req/h por aba, o limite é 5.000/h.
   Com 5 abas/aparelhos estoura. O botão "Carregar tarefas" e o "Salvar Token" ainda
   iniciam o intervalo duas vezes (`src/domService.js:56-70`).
4. **Texto com `%` quebra o app.** `renderTasks` roda `decodeURIComponent` em todo render,
   inclusive em texto ainda não codificado (`src/domService.js:19`): "100% feito" lança
   `URIError: URI malformed` (testado). O encode/decode também muta o array em memória.
5. **Token classic com escopo `repo`** em `localStorage` e `input type="text"`
   (`index.html:40,46`): dá acesso de escrita a todos os repos privados da conta.
6. `handleLoadTasks` chama `getItem()` sem chave (`src/script.js:139`), sempre nulo.
7. 404 devolve `{ fileData: [] }` sem `data` (`src/apiService.js:35`) e qualquer erro de
   rede cai no modal de token.
8. Branch de dados nasceu da `main`: carrega o código junto, 529 commits de dado ficaram
   na `main`, e `bancoDados.json` está no `.gitignore` mas é versionado.

## Arquitetura

Repo privado novo `beba-agua`, clone local em `~/Documents/beba-agua`. Sem build, sem
dependência.

```
index.html
src/style.css
src/app.js       estado, regras, eventos
src/github.js    leitura/gravação via Contents API
src/ui.js        render dos anéis, telas e histórico
```

Hospedagem: GitHub Pages em repo privado só funciona em plano pago (Pro). Enquanto o repo
for privado no plano Free, o app roda local (`python3 -m http.server`). Quando virar
público, ou se a conta for Pro, ativa Pages no modo "deploy from branch" (`main`, raiz),
sem workflow e sem mudar código.

### Dados: `agua.json` na branch `agua-dados` de `SamuelAraag/emagrecimento`

```json
{
  "versao": 1,
  "meta_ml": 3500,
  "dias": {
    "2026-10-02": { "ml": 1500, "meta_ml": 3500 }
  }
}
```

- Cada dia guarda a meta que valia naquele dia, então editar a meta não reescreve o passado.
  Editar a meta altera `meta_ml` global e a do dia de hoje.
- Chave do dia em data **local** (`getFullYear/getMonth/getDate`), nunca `toISOString()`,
  que vira o dia às 21h no Brasil.
- Branch órfã: só contém `agua.json`, sem histórico nem arquivos da `main`.

### `src/github.js`

- `ler()`: GET com `?ref=agua-dados`; decodifica base64 com `TextDecoder` (UTF-8 real, sem
  `encodeURIComponent` no conteúdo). Devolve `{ dados, sha }`. Distingue 401 (token
  inválido), 404 (arquivo/branch ausente) e erro de rede, cada um com mensagem própria.
- `gravar(dados, sha, mensagem)`: PUT com `sha` e `branch`. Devolve o `sha` novo ou lança
  erro tipado (`conflito` no 409).
- Token: fine-grained PAT restrito ao repo `emagrecimento`, permissão Contents
  read/write. Guardado em `localStorage`, campo `type="password"`. O modal explica como
  gerar esse token, não o classic.

### Regra de gravação (`src/app.js`)

Toda mudança é um delta, não um estado: `+500`, `-500` ou `meta = X`.
1. Aplica o delta na tela na hora (otimista).
2. Fila única de gravação: um PUT por vez; toques rápidos acumulam no delta pendente.
3. No 409: refaz o `ler()`, reaplica o delta sobre o dado remoto novo e tenta de novo
   (até 3 vezes). Como soma é comutativa, nenhum toque se perde entre aparelhos.
4. Falha definitiva: desfaz o delta na tela e mostra aviso com "tentar de novo".

### Sincronização: só ao recarregar a página

Sem polling, sem timer, sem `visibilitychange`. O app lê o JSON uma única vez, no
carregamento da página. Para ver o que outro aparelho gravou, ou para virar o dia, é só
atualizar a tela (F5 / puxar para baixo no celular).

A única leitura fora do carregamento é a do passo 3 acima (409), que existe porque a aba
pode estar com o `sha` velho: sem ela, o toque de um aparelho desatualizado seria
recusado. Depois de gravar, a tela mostra o total já somado com o remoto.

### Telas

1. **Login**: modal do token, só aparece sem token ou em 401. Botão "Sair" apaga o token.
2. **Configuração inicial** (quando `meta_ml` é nulo): "Quanto de água por dia?", atalhos
   1 L, 1,5 L, 2 L, 2,5 L, 3 L, 3,5 L e ajuste fino de 0,5 em 0,5 L. "Salvar meta".
   A mesma tela reabre ao tocar em "Meta: 3,5 L" na tela principal.
3. **Principal** (tema escuro, mobile primeiro):
   - Faixa da semana (seg a dom), 7 anéis pequenos com o progresso de cada dia; hoje
     destacado.
   - Anel grande em SVG com "1.500 ml" e "Meta: 3,5 L".
   - Botão único "+ 500 ml".
   - Link discreto "desfazer 500 ml" (corrige toque errado; some quando o dia está em 0).
   - Trajetória: lista dos últimos 30 dias com barra de consumo contra a meta.

### Meta batida e ultrapassagem

- Abaixo de 100%: arco azul proporcional.
- Em 100%: anel fecha, muda para verde e mostra um check.
- Acima de 100%: o anel fica fechado e um segundo arco, em outra cor, dá a segunda volta
  por cima, proporcional ao excedente. Texto "+500 ml acima da meta" e percentual real
  (114%). O contador de ml nunca trava na meta.
- Os anéis pequenos e as barras da trajetória usam a mesma regra, com marca no excedente.

## Passos de execução

1. Criar a branch órfã `agua-dados` no `emagrecimento` com `agua.json` inicial
   (`{"versao":1,"meta_ml":null,"dias":{}}`), num clone temporário. O PUT da API não cria branch, por isso
   ela precisa existir antes.
2. Criar o repo privado `beba-agua` e clonar em `~/Documents/beba-agua`. (feito)
3. Implementar `github.js`, depois `app.js`, depois `ui.js`/`style.css`.
4. Commit e push na `main`. Tentar ativar Pages pela API; se a conta não permitir em repo
   privado, deixar desativado e avisar.
5. Gerar o fine-grained PAT e colar no app.

Commits sem assinatura de IA. Textos sem travessão.

## Verificação

Servir local com `python3 -m http.server` e abrir no navegador:
- Sem token: modal aparece; token errado dá mensagem de 401, não erro genérico.
- Primeira vez: tela de meta; salvar grava um commit em `agua-dados`.
- "+ 500 ml": anel e número sobem; conferir o commit e o JSON na branch pela API.
- 7 toques com meta de 3,5 L: anel fecha em verde. Oitavo toque: segunda volta e
  "+500 ml acima da meta".
- Desfazer volta 500 ml e não deixa o dia negativo.
- Editar a meta: hoje muda, dias anteriores mantêm a meta antiga.
- Sem polling: aba aberta parada não faz nenhuma requisição (aba Network vazia).
- Conflito: duas abas abertas, tocar numa e depois na outra sem recarregar; o total final
  tem que somar os dois toques. A primeira aba só mostra o novo total depois do F5.
- 5 toques rápidos: gera poucos commits e o total bate.
- Conferir que nenhum commit novo caiu na `main` de `emagrecimento` nem de `beba-agua`.
- Se o Pages ativar, repetir o caminho principal na URL dele pelo celular.

## Risco conhecido

Fine-grained PAT não restringe por branch: o token do app pode escrever em qualquer
arquivo do repo `emagrecimento`. Aceitável por ser de uso pessoal; se incomodar, a saída é
mover os dados para um repo privado dedicado (troca de duas constantes em `github.js`).
