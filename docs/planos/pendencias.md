# Plano: pendências sugeridas para inclusão

Levantamento de 2026-10-07, depois do merge do PR #3. Nada aqui foi decidido: são
sugestões, na ordem em que eu faria. Cada item diz o que falta, por que vale a pena e o
tamanho do trabalho.

## Resumo

| # | Pendência | Tipo | Tamanho |
|---|---|---|---|
| 1 | Teste no iPhone | verificação | pequeno |
| 2 | Corrigir o registro de um dia passado | funcionalidade | médio |
| 3 | Conferir os registros retroativos | dados | pequeno |
| 4 | "Meta: 3,5 L" com cara de botão | UX | pequeno |
| 5 | Resumo na trajetória | funcionalidade | pequeno |
| 6 | README em dia e remoção do `PLANO.md` | documentação | pequeno |
| 7 | Catálogo de padrões | documentação | pequeno |

## 1. Teste no iPhone

Tudo o que entrou no PR #3 foi testado no Chrome do computador, com toques simulados.
Falta ver no aparelho:

- O gesto de puxar para atualizar, e se ele briga com o elástico do Safari.
- A instalação na tela inicial: ícone, nome e abertura sem a barra do navegador.
- As áreas seguras: o cabeçalho abaixo do relógio e o aviso de falha acima da barra inferior.
- O respiro de 48 px no topo da página.
- A animação de soltar o puxar, que não rodou no teste porque a aba estava em segundo plano.

Vem primeiro porque o resultado pode mudar os outros itens. Depende de o app estar
servido por HTTPS num endereço que o iPhone alcance; pelo `localhost` do computador não dá
para instalar na tela inicial. O app instalado tem armazenamento separado do Safari e pede
o token de novo na primeira vez.

## 2. Corrigir o registro de um dia passado

Hoje só o dia corrente é editável. O plano completo está em
[editar-dia-passado.md](editar-dia-passado.md): tocar num dia da semana ou numa linha da
trajetória abre um editor de mais e menos 500 ml, e o delta de gravação passa a carregar o
dia.

Esse item resolve junto outra pendência: os anéis da faixa da semana hoje são só enfeite,
sem número e sem resposta ao toque. Com o plano, cada dia vira um botão.

## 3. Conferir os registros retroativos

Os dias de 26/09 a 05/10 entraram por um commit manual na `agua-dados`, com valores
estimados pelo desenho dos anéis de uma captura de tela, assumindo meta de 3,5 L e
arredondando para 500 ml. Dois dias ficaram entre dois degraus e podem estar 500 ml fora:
28/09 (gravado 3.000 ml) e 03/10 (gravado 1.500 ml).

Sugestão: conferir com os números reais, se existirem. Com o item 2 pronto, a correção sai
pela própria tela.

## 4. "Meta: 3,5 L" com cara de botão

O texto dentro do anel é um botão que abre a tela de meta, mas parece legenda. Sugestão:
dar a ele um sinal de que é tocável, como um ícone de lápis ou um sublinhado, sem tirar o
destaque do número de ml.

## 5. Resumo na trajetória

A trajetória é uma lista de até 30 linhas sem nenhuma leitura de conjunto. Sugestão: uma
linha acima da lista com a média diária do período e a sequência atual de dias com a meta
batida. Os dois números saem do `agua.json` que já está em memória, sem requisição nova.

## 6. README em dia e remoção do `PLANO.md`

- O `README.md` não cita o que entrou depois do MVP: o botão "Atualizar", o puxar para
  atualizar, a confirmação ao sair, o `src/logo.svg`, a pasta `icones/` e o
  `manifest.webmanifest`.
- Existe uma versão reescrita do README, com frases mais diretas, parada sem commit no
  clone local.
- O `PLANO.md` da raiz serviu só para construir o MVP e descreve decisões que já mudaram
  (dizia "sem polling" e que os dados só eram relidos ao recarregar a página). A remoção
  também está parada sem commit.

Sugestão: um commit só, com o README atualizado e o `PLANO.md` removido.

## 7. Catálogo de padrões

Os tokens de cor, espaço e raio e as classes reutilizáveis (`botao`, `dialogo`, `pilha`,
`anel`, `aviso`) só estão documentados num comentário no topo do `src/style.css`. Sugestão:
um `docs/ux/catalogo.md` curto, com cada token, cada classe e um exemplo de uso, para a
próxima tela reaproveitar o que existe em vez de recriar.
