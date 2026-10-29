# Acompanhamento Diário

Gestor de tempo e atividades para colaboradores (atividades diárias, demandas/chamados,
treinamentos, metas, relatórios). O controle de apontamento de horas é só UM módulo; nasceu
como o núcleo, mas já não é.

@docs/PLANO.md

## Regras
- O Plano.md é a fonte da verdade (visão, regras de negócio, arquitetura, fases).
  Atualize-o junto com qualquer mudança de comportamento.
- Pense em "gestão do dia/semana do colaborador" antes de "horas lançadas".
- Não expandir o módulo de apontamento; integre novas features via Demanda e Tarefa.
- Não renomear tabelas ou rotas públicas sem migração e minha aprovação.
- UI, textos e commits em pt-BR; identificadores no código em inglês.
- Nunca incluir dados reais (nomes, pedidos, chamados) em código, testes ou commits.