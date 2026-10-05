# Tendência da apuração 2026

Página que acompanha o 2º turno: presidente do Brasil e governador dos estados que foram para a disputa. O gráfico mostra os três mais votados conforme a apuração das seções avança.

O [cron-job.org](https://console.cron-job.org/jobs) chama `POST /api/atualizar` a cada minuto. Essa rota lê os arquivos do TSE e grava a série no Neon. A página pede `GET /api/apuracao` a cada 15 segundos. Essa leitura usa o cache do Next.js e só volta ao banco quando a apuração muda.

## Job no cron-job.org

Depois do deploy:

- URL: `https://<domínio>/api/atualizar`
- Método: POST
- Agenda: a cada 1 minuto, a partir das 16h50 de 25/10/2026, horário de Brasília
- Header: `Authorization: Bearer <CRON_SECRET>`
- O `CRON_SECRET` é o mesmo valor configurado na Vercel

## Variáveis

Veja `.env.example`. A base e os códigos do TSE ficam no código: `https://resultados.tse.jus.br/oficial`, 1º turno federal `6257` e estadual `6259`, 2º turno federal `6258` e estadual `6260`. A página abre no 2º turno.

O arquivo de resultado (`…-u.json`) responde 404 até a divulgação, a partir das 17h de 25/10/2026. Os campos desse JSON estão na especificação EA20 do TSE.
