---
name: avaliar-variantes
description: >-
  Avalia com o Stockfish as variantes de uma abertura ou defesa e grava 🥇🥈🥉
  nos três melhores ramos. Use ao adicionar, implementar ou atualizar uma
  abertura ou defesa neste projeto, ou quando o usuário pedir para marcar as
  melhores variantes.
---

# Avaliar variantes

As medalhas ficam gravadas em `openings.js`. O site não reavalia a árvore ao abrir.

Depois de incluir ou alterar uma árvore em `openings.js`, rode a avaliação antes de terminar:

```bash
node scripts/rank-openings.js NOME_DA_ARVORE
```

`NOME_DA_ARVORE` é o global em maiúsculas, como `SLAV` ou `ORTHODOX`. Sem argumento, o script refaz todas as árvores.

O script percorre cada bifurcação e ordena os ramos pela força do lance de quem está na vez. Os três primeiros recebem `🥇 `, `🥈 ` e `🥉 `. Rodar de novo substitui as medalhas antigas.
