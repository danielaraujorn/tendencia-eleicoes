# Tendência da apuração 2026

Página que acompanha o 1º turno: presidente do Brasil, governador de cada estado, e os mais votados a senador, deputado federal e deputado estadual do estado escolhido. O gráfico de presidente e governador mostra os três mais votados conforme a apuração das seções avança. As listas abrem com oito nomes e podem chegar a vinte.

O [cron-job.org](https://console.cron-job.org/jobs) chama `POST /api/atualizar` a cada minuto. Essa rota lê os arquivos do TSE e grava a série no Neon. A página pede `GET /api/apuracao` a cada 15 segundos. Essa leitura usa o cache do Next.js e só volta ao banco quando a apuração muda.

## Job no cron-job.org

Depois do deploy:

- URL: `https://<domínio>/api/atualizar`
- Método: POST
- Agenda: a cada 1 minuto, a partir das 16h50 de domingo, horário de Brasília
- Header: `Authorization: Bearer <CRON_SECRET>`
- O `CRON_SECRET` é o mesmo valor configurado na Vercel

## Variáveis

Veja `.env.example`. Em produção, `TSE_BASE_URL` fica em `https://resultados.tse.jus.br/oficial`. Os códigos da eleição saem de `{TSE_BASE_URL}/comum/config/ele-c.json`, publicado antes da apuração. No 1º turno de 2026 esse arquivo lista a federal `6257` e a estadual `6259`. `TSE_ROUND=2` lê o 2º turno (`6258` e `6260`).

`TSE_FEDERAL_ELECTION` e `TSE_STATE_ELECTION` só entram se as duas estiverem definidas. Sem elas, vale o `ele-c.json`.

O arquivo de resultado (`…-u.json`) responde 404 até a divulgação, a partir das 17h. Os campos desse JSON estão na especificação EA20 do TSE. O simulado em `https://resultados-sim.tse.jus.br/simulado/simulado2026` já serve o mesmo formato.
