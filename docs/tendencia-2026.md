# Tendência da apuração presidencial, 2026

A noite medida é a de 25 de outubro de 2026, 2º turno, código TSE 6258. Lula é o 13, Flávio é o 22. Lula fechou com 51,78% e Flávio com 48,22%, em 99,96% das seções. O 1º turno, código 6257, foi em 4 e 5 de outubro. Flávio fechou com 47,03% e Lula com 45,16%. A série do 1º turno por UF, ao longo da noite, não existe no banco: só o retrato final de cada UF, gravado em 25 de outubro.

Os retratos estão em `snapshots`. A chave nacional é `presidente:{código}`. A de cada UF é `presidente-{uf}:{código}`. `pst` é o percentual de seções, não de eleitores. Os votos usados são os de destino `Válido`. O teste está em [scripts/curve-backtest.ts](../scripts/curve-backtest.ts). Os cinco gráficos de 10% a 50% estão no canvas `tendencia-derivada.canvas.tsx` e desenham a derivada, que ganhou o caminho.

O gráfico ao vivo não mudou. Ele continua a reta amortecida de [lib/trend.ts](../lib/trend.ts): inclinação dos últimos 10 pontos de apuração nacional, multiplicada por `pst * (100 - pst) / 100`, desenhada até 100% em [components/race-chart.tsx](../components/race-chart.tsx).

## O que a curva nacional é

O percentual do país é a média de cada UF vezes os votos dela. Duas coisas se somam. A média dentro da UF pode andar. Os votos que entram também mudam de estado, porque as UFs têm tamanhos e ritmos diferentes.

Se a mistura que está entrando fica parada, o percentual nacional contra os votos contados é uma hipérbole, não uma reta até o fim. O movimento em direção à mistura que falta acontece cedo. Essa curva não consegue descer e depois subir.

A noite desceu e depois subiu. O Nordeste entrou cedo, com Lula alto. O Sudeste entrou depois, com Lula mais baixo e muito mais votos válidos. A curva nacional tinha de cair. Isso é a ordem de chegada. A reta até um nowcast estratificado, e a hipérbole com todas as UFs avançando juntas, achatam esse caminho.

O ritmo de cada UF é a fração de seções por minuto nos últimos 10 pontos dela, com teto de 0,25 por minuto. O tempo até a UF acabar, com ritmo constante, é `(1 - p) / ritmo`. O total de votos válidos da UF é o que já entrou, encolhido para votos por seção vezes o total de seções quando a apuração ainda é baixa (`PRIOR_K` 0,15).

## Como se mede

Marcos de apuração nacional: 10, 20, 30, 40, 50, 60 e 70%. No 1º turno a série nacional não tem 50, 60 e 70; o marco extra possível é 65%. Em cada marco só entra o que já tinha acontecido.

O erro que decide é a distância média ao longo do caminho depois do marco, o percentual previsto contra os retratos nacionais seguintes no mesmo `pst`. O erro no destino, em 100%, é secundário. Uma curva nova só substitui a derivada se o caminho aos 10% não piorar e o dos 20% melhorar, sem abrir o erro dos 40% aos 70%. Não se escolhe meia-vida nem priori para acertar esta única noite.

No começo da noite a derivada fica com erro mediano perto de 0,5 até cerca de +10 a +20 pontos. No fim da noite, +30 ainda fica abaixo de 0,5. Esse horizonte não é o mesmo cedo e tarde, então o traço ao vivo não foi cortado.

## A derivada, que ficou

Para cada UF, a inclinação é a reta da média acumulada contra o `pst` dela nos últimos 10 pontos, em pontos percentuais por ponto de apuração, limitada a 0,5, e reduzida por `p / (p + 0,15)` quando a UF ainda tem pouca apuração. Essa inclinação segue até a UF chegar a 100%, na ordem do ritmo recente. A média de Flávio no 2º turno é o complemento da de Lula.

Erro de caminho de Lula, erro no destino e percentual final previsto:

- 10%: caminho 0,37, destino 0,49, fim 51,29
- 20%: caminho 0,77, destino 1,70, fim 50,08
- 30%: caminho 0,30, destino 0,78, fim 51,00
- 40%: caminho 0,18, destino 0,16, fim 51,94
- 50%: caminho 0,22, destino 0,13, fim 51,65
- 60%: caminho 0,25, destino 0,44, fim 51,34
- 70%: caminho 0,17, destino 0,42, fim 51,36

Aos 10% a curva desce e depois sobe, junto com a apuração. Aos 20% a inclinação era precisa e mesmo assim não durou até o fim.

## O que foi testado e não substituiu a derivada

Média da UF parada, com o ritmo de chegada. O Sudeste puxa pelo tamanho e pela hora, mas a média da própria UF não anda. Caminho aos 10% 1,12, aos 20% 0,54, aos 30% 0,37, aos 40% 0,54, aos 50% 0,40, aos 60% 0,35, aos 70% 0,22. Perde aos 10% e dos 40% em diante.

Inclinação encolhida para zero com variância do resíduo, desvio a priori 0,05, e todas as UFs avançando juntas. Aos 20% a inclinação era precisa, então o encolhimento não a derrubou. Junto com o avanço simultâneo, o caminho aos 10% foi para 1,25. Rejeitada.

Inclinação só nos próximos 10 pontos da UF e zero depois, ainda no ritmo. Aos 20% o caminho caiu para 0,53, mas aos 10% subiu para 0,89, e dos 40% aos 70% também abriu.

Persistência da inclinação. Antes do marco, para cada UF que já tinha 10 pontos seguintes, compara-se o previsto pela inclinação com o que a média de fato andou. O coeficiente fica entre 0 e 1. Aos 10% foi 0,41, com 10 UFs, e o caminho foi para 0,72. Aos 20% foi 0,99, com 17 UFs, porque até ali a inclinação tinha durado, e o caminho ficou em 0,76. Dos 30% aos 70% os coeficientes foram 0,30, 0,46, 0,49, 0,38 e 0,26, e o caminho piorou em todos.

Mistura recente, sem reta. Os votos que faltam repetem a mistura dos votos que entraram nos últimos 10 pontos da UF. A média acumulada se aproxima dessa mistura e achata. No Rio Grande do Sul, aos 30% da UF, a reta levava a cerca de 49,5% e a mistura recente a cerca de 41%; o estado fechou em 42,2%. Em São Paulo a mistura dos votos novos ainda subiu depois, de cerca de 44% aos 40% da UF para cerca de 51% no fim, com os votos por ponto de apuração quase parados, perto de 261 mil. No país, o caminho aos 10% foi 1,05 e aos 20% 0,87. Só aos 60% melhorou. Rejeitada.

Ritmo que muda. A velocidade recente contra a dos 10 pontos anteriores, e o quanto essa mudança se repetiu na faixa seguinte, nas UFs que já tinham completado as três faixas. Coeficiente 0 até 30%: aos 10% só 3 UFs tinham a passagem, aos 20% e 30% a mudança não durou. Aos 40% o coeficiente foi 0,10 e o caminho foi de 0,18 para 0,19. Aos 50% foi 0,22 e o caminho caiu para 0,15. Aos 60% e 70% o erro abriu. No começo da noite Bahia, São Paulo e Rio de Janeiro andavam perto de 0,2 a 0,3 ponto por minuto e no meio passaram de 1. Essa aceleração não estava estável antes do marco.

Caminho já visto na região. No trecho que pelo menos duas UFs da mesma região já cruzaram, a UF herda a variação mediana delas, não o nível delas. Onde ninguém passou, continua a derivada. Aos 20% do país, São Paulo estava em 2,2% (Lula 37,85%, fechou 46,15%) e o Rio de Janeiro em 0,3% (41,03%, fechou 46,90%). O Espírito Santo já estava em 33% e Minas em 14%. O caminho aos 20% melhorou, de 0,77 para 0,65. Aos 10% piorou, de 0,37 para 0,52. Dos 40% aos 70% foi 0,28, 0,29, 0,29 e 0,19, contra 0,18, 0,22, 0,25 e 0,17 da derivada. Rejeitada.

Reta ao vivo, a de produção. Aos 10% do 2º turno o destino errou cerca de 4,2 pontos e apontou Lula com 47,62%, do lado errado. A inclinação nacional crua, sem amortecer, levou o fim para cerca de 22%. No 1º turno, aos 10%, o destino da reta amortecida errou cerca de 5,8 pontos e a crua cerca de 21. A reta amortecida é um bom ajuste local no fim da noite e um destino ruim no começo.

Priori do 1º turno na UF inteira, misturada à média do 2º, piorou aos 10% e chegou perto de um empate do lado errado.

## O que falta, e fica para daqui a quatro anos

A informação que a série da UF não tem é qual município já entrou. Aos 20% do país, a média de São Paulo ainda ia andar cerca de 8 pontos. Isso é o conjunto de cidades que já tinham chegado, contra as que faltavam. Não é o tamanho da seção.

O índice de cada UF no TSE lista, município a município, seções apuradas e seções totais. Esse arquivo não foi gravado ao longo da noite de 2026, e o arquivo atual está no fim. Branco, nulo, comparecimento e aptos vinham no arquivo e também não foram gravados. A governador usa as mesmas seções.

Na eleição seguinte, gravar esse índice em cada ciclo. A votação de cada município no turno anterior entra como tabela fixa. O que já foi apurado vale pelo voto contado. O que falta entra com a mistura daquele município. Onde o índice não chegou, continua a derivada. O critério de troca continua o caminho aos 10%, aos 20% e dos 40% aos 70%. Nesta noite isso não tem como ser medido.
