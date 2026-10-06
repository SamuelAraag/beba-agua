# Beba Água

Contador de água diário. Você define a meta uma vez e, no dia a dia, só aperta um botão:
cada toque soma 500 ml à cota de hoje.

## Como funciona

- **Meta diária**: configurada no primeiro acesso (1 L a 3,5 L, ou ajuste de 0,5 em 0,5 L)
  e editável depois tocando em "Meta".
- **+ 500 ml**: botão único, sempre o mesmo valor, direto para o dia de hoje.
- **Meta batida**: o anel fecha e fica verde.
- **Passou da meta**: a contagem continua. Um segundo arco mostra o excedente, com o
  texto "+X ml acima da meta" e o percentual real.
- **Trajetória**: faixa da semana com um anel por dia e histórico dos últimos 30 dias.
- **Desfazer**: remove os últimos 500 ml em caso de toque errado.

## Armazenamento

Não tem servidor. Os dados ficam num arquivo `agua.json`, na branch `agua-dados` deste
mesmo repositório, lido e gravado pela API de Contents do GitHub. Cada toque vira um
commit nessa branch; a `main` nunca recebe dado.

```json
{
  "versao": 1,
  "meta_ml": 3500,
  "dias": {
    "2026-10-05": { "ml": 1500, "meta_ml": 3500 }
  }
}
```

Cada dia guarda a meta que valia naquele dia, então mudar a meta não altera o passado.

O app lê os dados quando a página carrega e depois relê sozinho: a cada 5 minutos com a
tela visível e em foco, e a cada 15 minutos com a tela oculta ou sem foco. Ao voltar para a
tela, ele sempre relê na hora. É assim que aparece o que foi registrado em outro aparelho, e
o dia também vira sozinho, sem atualizar a tela. Se dois aparelhos gravarem ao mesmo tempo,
o app relê o arquivo e soma de novo, e nenhum toque se perde.

## Login

O acesso é feito com um token pessoal do GitHub, guardado só no navegador.

1. GitHub > Settings > Developer settings > Personal access tokens > **Fine-grained tokens**.
2. **Generate new token**, acesso apenas ao repositório `SamuelAraag/beba-agua`.
3. Permissão **Contents: Read and write**.
4. Copie o token e cole na tela de login do app.

O botão "Sair" apaga o token do navegador.

## Rodar localmente

Sem build e sem dependências:

```
python3 -m http.server 8000
```

Abra `http://localhost:8000`.

## Estrutura

```
index.html
src/style.css
src/app.js       estado, regras e eventos
src/github.js    leitura e gravação via API do GitHub
src/ui.js        anéis, telas e histórico
```

## Estado

MVP implementado na branch `mvp`. O plano completo está em [PLANO.md](PLANO.md).
