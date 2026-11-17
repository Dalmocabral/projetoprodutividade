# TODO — Painel de Produtividade Portuária

## Visão operacional dos portêineres
- [x] Acompanhar minuto a minuto os portêineres identificados como P4, P5, P6, P7, P8 e P9.
- [x] Exibir indicadores individuais por portêiner com movimentos acumulados, MPH e comparação com a pedida de 27 MPH.
- [x] Disponibilizar filtros por portêiner e intervalo de tempo para análise do turno.

## Medição de movimentos e de carga
- [x] Usar a pedida de referência de 27 MPH para contar ciclos físicos do guindaste, com cada ciclo de subida/descida valendo 1 movimento.
- [x] Contar um contêiner de 40 pés como 1 movimento e 2 TEU, independentemente de estar em operação simples.
- [x] Contar um twin lift de dois contêineres de 20 pés como 1 movimento e 2 TEU; um contêiner de 20 pés movimentado sozinho vale 1 movimento e 1 TEU.
- [x] Exibir movimentos e TEUs separadamente; o número de TEUs não deve ser usado para inferir ou comparar movimentos com a meta de MPH.
- [x] Mostrar a evolução do MPH em um gráfico de linha e oferecer uma visualização experimental em velas para identificar períodos acima ou abaixo da pedida.

## Demonstração minuto a minuto
- [x] Usar dados fictícios realistas para demonstração e testes, com atualização simulada minuto a minuto.
- [x] Deixar visível que os dados são simulados, sem apresentar a demonstração como conexão ao banco da empresa.

## Paradas e eventos operacionais
- [x] Registrar e sinalizar paradas operacionais inevitáveis, incluindo retirada de tampão, espera pela passagem de outros navios e demora de carretas no abastecimento.
- [x] Disponibilizar filtro por tipo de evento operacional e distinguir períodos de parada da produtividade observada.

## Relatórios para gestores
- [x] Permitir gerar um relatório parcial do período recente e um relatório final que cubra todo o período de dados disponível; indicar claramente o intervalo e que os dados são de demonstração.
- [x] Incluir no relatório o resumo por portêiner: movimentos, TEUs como volume separado, ritmo em MPH contra a pedida de 27 MPH, disponibilidade e situação acima/abaixo da pedida.
- [x] No relatório final, detalhar paradas por portêiner, motivo, horário e duração; resumir os principais motivos de parada/gargalos e identificar janelas de menor produtividade abaixo da pedida.
- [x] Permitir preencher destinatários e preparar um e-mail com assunto e conteúdo do relatório no aplicativo de e-mail do usuário; a versão atual deve deixar claro que o e-mail é um rascunho para revisão/envio manual, sem envio automático.
- [x] Permitir copiar ou baixar o texto do relatório para registro e compartilhamento.
- [x] Gerar um PDF baixável para os relatórios parcial e final, com layout gerencial, gráfico de evolução MPH versus a pedida de 27 MPH, comparação de P4–P9 e TEU separado, além de paradas, gargalos e janelas de maior/menor produtividade.
- [x] Permitir baixar o PDF pela janela de relatórios e informar que ele pode ser anexado manualmente ao e-mail; o rascunho `mailto:` não anexa arquivos automaticamente.

## Operação Multi-Navio e Saldo Decrescente de Movimentos
- [x] Configuração dinâmica de alocação de portêineres por navio/berço (ex: P4/P5 no Navio 01, P6/P7 no Navio 02 ou Standby).
- [x] Definição de meta de movimentos programados por portêiner (ex: P4 com 500, P5 com 600 movimentos).
- [x] Contagem regressiva em tempo real do saldo de movimentos restantes e percentual de progresso em cada card.
- [x] Previsão de término da manobra (ETC - Estimated Time of Completion) projetada a partir do ritmo médio em MPH.
- [x] Filtro operacional para exibir exclusivamente os guindastes em atividade no navio selecionado.

## Escopo de integração e evolução
- [x] Manter o projeto em ReactJS com Vite e estruturar a origem dos dados para substituir a simulação por uma fonte corporativa autorizada em etapa posterior.
- [x] Focar esta versão na produtividade dos portêineres; o tempo de carretas para abastecimento fica como etapa futura, não como indicador implementado agora.
