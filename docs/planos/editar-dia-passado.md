# Plano: corrigir o registro de um dia passado

## Contexto

Hoje o app só altera o dia corrente: "+ 500 ml" soma e "desfazer 500 ml" tira. Quem esquece
de registrar, ou registra errado e só percebe no dia seguinte, não tem como corrigir pela
tela. Em 2026-10-06 os dias de 26/09 a 05/10 precisaram entrar por um commit manual na
branch `agua-dados`.

O objetivo é corrigir qualquer dia dos últimos 30 pela própria tela, com a mesma garantia
de gravação que o dia de hoje já tem.

## Decisões

- **Alcance:** os mesmos 30 dias da trajetória. Dia futuro não é editável.
- **Passo:** 500 ml, igual ao resto do app. Sem campo de digitação.
- **Meta do dia:** um dia que já tem registro mantém a `meta_ml` dele. Um dia sem registro
  nasce com a meta global atual, porque não há como saber a meta que valia na época.
- **Meta de dia passado não é editável.** Fica fora deste plano.
- **Dia zerado continua no arquivo** com `ml: 0`, para não perder a meta que valia nele.

## Experiência

1. Tocar num dia da faixa da semana ou numa linha da trajetória abre o editor daquele dia.
   Hoje também abre, e mostra o mesmo valor do anel grande.
2. O editor é um diálogo com o nome do dia ("segunda, 05/10"), o total em destaque, a meta
   do dia e três controles: "- 500 ml", "+ 500 ml" e "Fechar".
3. Cada toque muda o total na hora e grava em segundo plano, como no dia de hoje. Não tem
   botão "Salvar".
4. "- 500 ml" fica desabilitado quando o dia está em 0.
5. Ao fechar, a faixa da semana e a trajetória já mostram o valor novo.

Para a trajetória mostrar dias sem registro, a lista passa a ir sempre até 30 dias atrás,
e não só até o dia mais antigo com registro. Os dias vazios ficam com a barra zerada.

## Regra de gravação

O delta de hoje é `{ ml, meta }` e sempre mira o dia corrente. Ele passa a carregar o dia:

```js
{ dias: { '2026-10-05': +500, '2026-10-07': -500 }, meta: null }
```

- `somarDeltas` soma dia a dia.
- `aplicar` percorre `dias` e aplica cada soma com o piso em 0. `meta` continua valendo
  para a meta global e para o dia de hoje.
- `deltaVazio` é verdadeiro quando todas as somas são 0 e `meta` é nula.
- A fila única, a reaplicação no 409 e o desfazer na tela em caso de falha não mudam.
- Mensagem de commit: `agua: +500 ml (2026-10-05)`. Com mais de um dia no mesmo delta, um
  trecho por dia, separados por vírgula.

`virarDia` hoje troca a variável `hoje` com a fila vazia. Com o dia dentro do delta essa
trava deixa de ser necessária para a gravação, mas continua valendo para a tela.

## Arquivos

- `src/app.js`: formato novo do delta, `aplicar`, `somarDeltas`, `deltaVazio`,
  `mensagemDeCommit`, `descrever` e as ações `abrirDia`, `ajustarDia` e `fecharDia`.
- `src/ui.js`: dias da semana e linhas da trajetória viram botões; render do editor;
  trajetória com os 30 dias.
- `index.html`: o diálogo do editor, com a classe `dialogo` que o login e a confirmação
  de saída já usam.
- `src/style.css`: estilo dos dias como botão (foco visível, área de toque de 44 px) e do
  conteúdo do editor. Sem cor nova: só os tokens que já existem.

## Estados e acessibilidade

- Salvando: a linha "Salvando..." / "Salvo às 16:30" da tela principal já cobre.
- Falha: o aviso atual passa a dizer o dia ("Não deu para salvar +500 ml em 05/10").
- Diálogo nativo: foco preso, Esc fecha, foco volta para o dia que abriu.
- Cada dia tem nome acessível completo: "segunda, 05/10: 2.500 ml, 71% da meta. Editar".
- O total do editor fica numa região `aria-live`, para o leitor de tela ouvir cada toque.

## Verificação

Contra a API falsa local e depois contra o repositório real:

- Abrir 05/10, somar 500 ml: o commit cita 05/10 e o `agua.json` muda só esse dia.
- Tirar até 0: o botão "- 500 ml" desabilita e o dia fica com `ml: 0` e a meta original.
- Dia sem registro: nasce com a meta global atual.
- Editar a meta global depois: o dia passado já editado mantém a meta dele.
- Tocar em dois dias diferentes em sequência rápida: um commit só, com os dois dias certos.
- Conflito: outro aparelho soma no mesmo dia passado enquanto esta aba está velha; o total
  final soma os dois lados.
- Falha de gravação: o valor volta na tela e "Tentar de novo" grava no dia certo.
- Teclado: Tab chega em todos os dias, Enter abre, Esc fecha e o foco volta.
- 320 px: os sete dias da semana cabem como botões sem estourar a largura.

## Fora do escopo

- Digitar um valor livre em ml.
- Editar a meta de um dia passado.
- Editar dias com mais de 30 dias.
- Apagar um dia do arquivo.
