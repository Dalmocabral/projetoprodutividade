# Portline — produtividade portuária

Protótipo React + Vite para acompanhar os portêineres P4, P5, P6, P7, P8 e P9 minuto a minuto. A demonstração usa dados fictícios, com avanço automático a cada minuto, botão de avanço manual e registro/retomada de paradas simuladas.

## Regra operacional: MPH e TEU são métricas diferentes

A pedida é **27 MPH (movimentos por hora) por portêiner**. MPH conta ciclos físicos do guindaste: cada ciclo de subida/descida é **1 movimento**, independentemente da quantidade de TEUs levada naquele ciclo.

- Um contêiner de 20 pés movimentado sozinho: **1 movimento e 1 TEU**.
- Um contêiner de 40 pés movimentado em um ciclo: **1 movimento e 2 TEU**.
- Twin lift de dois contêineres de 20 pés juntos: **1 movimento e 2 TEU**.

Os indicadores, comparações com a pedida, gráfico de linha e velas usam **MPH**. A quantidade de contêineres/TEUs aparece separadamente como volume movimentado; TEUs não são somados como movimentos. O ritmo é calculado com os movimentos dos últimos 15 minutos, projetados para uma hora. A disponibilidade e as paradas aparecem separadamente para contextualizar o resultado.

A visualização experimental de velas agrega janelas de cinco minutos: abertura, máxima, mínima e fechamento do ritmo em MPH; a cor do fechamento indica se ficou acima ou abaixo da pedida.

## Operação multi-navio e saldo decrescente

O terminal permite trabalhar com mais de um navio simultaneamente (ex: *MSC Búzios* no Berço 01 e *CMA CGM Santos* no Berço 02) ou com apenas 1 navio com guindastes dedicados. 

Pelo botão **Configurar navios** ou clicando no cartão do berço na barra lateral:
- Defina em qual navio cada portêiner está alocado (ou deixe em *Standby* se não estiver operando).
- Defina a **meta programada de movimentos** para cada guindaste (ex: P4 com 500 movimentos, P5 com 600 movimentos).
- Cada card exibe a **contagem decrescente em tempo real do saldo restante de movimentos**, o percentual de avanço do plano e a previsão de término da manobra (ETC — *Estimated Time of Completion*) calculada a partir do ritmo de MPH observado.
- O seletor de navio filtra a visualização para exibir apenas os portêineres dedicados àquele navio, mantendo o painel limpo e sem poluição de equipamentos ociosos.

## Relatórios para gestores

O botão **Relatórios** prepara um relatório parcial da última hora disponível ou um relatório final de todo o histórico disponível na demonstração. Ambos mostram movimentos e TEUs separadamente, MPH por portêiner contra a pedida, disponibilidade e janelas de destaque/baixa produtividade; o relatório final também detalha paradas por motivo, portêiner, horário e duração.

O texto pode ser copiado ou baixado como `.txt`. Para compartilhar por e-mail, informe os destinatários e use **Preparar e-mail**: o navegador abre o aplicativo de e-mail padrão com assunto e conteúdo preenchidos, para revisão e envio manual. Não há envio automático, provedor de e-mail nem destinatários corporativos configurados neste protótipo.

## Executar

```bash
pnpm install
pnpm dev
```

Verificações e build:

```bash
pnpm typecheck
pnpm build
```

## Origem dos dados

O dashboard consome o adaptador `src/domain/data-source.ts`; nesta etapa, ele aponta exclusivamente para o simulador local (`src/domain/simulator.ts`). O aviso de simulação permanece explícito na interface. Uma integração futura deve implementar a mesma fronteira usando uma API corporativa autorizada, com validação de acesso no servidor — nunca expor credenciais nem conectar o navegador diretamente ao banco da empresa. Nenhuma conexão corporativa foi configurada neste protótipo.

A medição de tempo de atendimento das carretas continua fora do escopo desta primeira etapa; “demora de carreta no abastecimento” existe apenas como motivo de parada simulável.
