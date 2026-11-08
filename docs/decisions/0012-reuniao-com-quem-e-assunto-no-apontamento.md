# 0012 — Reunião declarada só pelo tipo; com quem e assunto no apontamento

- **Data:** 2026-11-08
- **Status:** aceita
- **Contexto:** PLANO.md, seções 1, 2, 9, 10 e 13 (v0.14)

## Decisão

1. **A reunião declarada é só o tipo** (ex.: "Repasses", "Daily"). Cada ocorrência, no apontamento, diz **com quem** e
   **sobre o quê** (campos opcionais, até 200 caracteres). O que era identidade da reunião (pessoas e assunto) vira
   dado da ocorrência: a mesma reunião acontece com pessoas e assuntos diferentes.
2. **Vale daqui para a frente.** As reuniões já declaradas ficam como estão, com as pessoas e o assunto que já têm.
   Nada é copiado nem juntado, e os apontamentos antigos ficam com os campos novos vazios. A função
   `meetingOccurrence` (`shared/src/demands.ts`) devolve os dados da ocorrência: os do apontamento quando preenchidos;
   senão, os da demanda (reunião antiga).
3. **Unicidade:** a reunião nova é única pelo tipo (sem diferenciar maiúsculas). As antigas não entram nessa checagem.
4. **Banco (migração 9):** `activities` ganha `participants` e `subject` (texto, padrão vazio); `demands` é recriada
   com o CHECK da reunião exigindo só `meeting_type`. `participants` e `title` da reunião ficam como estavam
   (nulos/vazios nas novas). O `schemaVersion` da exportação sobe para 9.
5. **API:** `POST/PUT /api/demands` de reunião aceita só `meetingType`; `participants` e `subject` enviados são
   ignorados (um cliente antigo não quebra) e, ao editar uma reunião antiga, o que ela já tem é preservado.
   `POST/PUT /api/activities` aceita `participants` e `subject`, gravados só quando a demanda é uma reunião.
6. **Relatórios:** o diário mostra, por reunião, o tipo, os assuntos e as pessoas **dos apontamentos do dia**, sem
   repetir ("entrei em reunião de Repasses (assunto X) com A e B"); o do período, "Repasses — 3 vezes · assuntos: A, B
   · com: X, Y".

## Consequências

- Uma "Repasses" antiga (com pessoas e assunto) e uma nova (só o tipo) podem coexistir no campo Demanda do
  apontamento; a antiga mostra o assunto no nome ("Daily · Status do dia"), o que as separa.
- Exportações anteriores à v0.14 deixam de importar (o `schemaVersion` mudou): é a regra vigente.
- **Futuro:** integração com o Google Agenda para buscar as reuniões do dia e sugerir os apontamentos (tipo, com
  quem, assunto). Fora desta versão.
