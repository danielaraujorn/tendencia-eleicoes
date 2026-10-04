"use client";

import { useEffect, useState } from "react";
import { RacePanel } from "@/components/race-panel";
import { RankingPanel } from "@/components/ranking-panel";
import {
  LIST_OFFICES,
  PRESIDENT_ID,
  STATE_OPTIONS,
  stateRaceId,
  type StateId,
} from "@/lib/labels";
import { POLL_END_MS, POLL_INTERVAL_MS, POLL_START_MS, pollPhase, type PollPhase } from "@/lib/poll";
import type { ApuracaoResponse } from "@/lib/types";

function waitingCopy(source: ApuracaoResponse["source"] | null) {
  if (source === "simulado") return "Aguardando a leitura do simulado do TSE.";
  return "Aguardando o TSE. A divulgação começa às 17h, horário de Brasília.";
}

export function Dashboard() {
  const [data, setData] = useState<ApuracaoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [phase, setPhase] = useState<PollPhase>("before");
  const [stateId, setStateId] = useState<StateId>("rn");

  useEffect(() => {
    let active = true;
    let intervalId: number | undefined;
    let startId: number | undefined;
    let stopId: number | undefined;

    async function pull() {
      try {
        const response = await fetch("/api/apuracao", { cache: "no-store" });
        if (!response.ok) throw new Error("Falha ao carregar");
        const body = (await response.json()) as ApuracaoResponse;
        if (!active) return;
        setData(body);
        setError(null);
        setFetchedAt(new Date());
      } catch {
        if (active) setError("Não foi possível atualizar agora.");
      }
    }

    function begin() {
      if (!active) return;
      setPhase("during");
      void pull();
      intervalId = window.setInterval(() => void pull(), POLL_INTERVAL_MS);
      stopId = window.setTimeout(() => {
        if (intervalId !== undefined) window.clearInterval(intervalId);
        intervalId = undefined;
        if (active) setPhase("after");
      }, Math.max(0, POLL_END_MS - Date.now()));
    }

    const now = Date.now();
    if (now >= POLL_END_MS) {
      setPhase("after");
      void pull();
    } else if (now >= POLL_START_MS) {
      begin();
    } else {
      setPhase("before");
      void pull();
      startId = window.setTimeout(begin, POLL_START_MS - now);
    }

    return () => {
      active = false;
      if (intervalId !== undefined) window.clearInterval(intervalId);
      if (startId !== undefined) window.clearTimeout(startId);
      if (stopId !== undefined) window.clearTimeout(stopId);
    };
  }, []);

  const waiting = waitingCopy(data?.source ?? null);
  const clock = fetchedAt
    ? fetchedAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : null;

  return (
    <main>
      <header className="masthead">
        <p className="kicker">Eleições 2026 · 1º turno</p>
        <h1>Tendência da apuração</h1>
        <p className="deck">
          O percentual de cada candidatura conforme as seções vão sendo
          totalizadas. A página se atualiza sozinha.
        </p>
        <div className="state-bar">
          <label className="kicker" htmlFor="estado">
            Estado
          </label>
          <select
            id="estado"
            className="scope-select"
            value={stateId}
            onChange={(event) => setStateId(event.target.value as StateId)}
          >
            {STATE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <p className="meta">
          {phase === "before"
            ? "A atualização automática começa às 17h, horário de Brasília."
            : clock
              ? `Página atualizada às ${clock}`
              : "Carregando a série…"}
          {data?.source === "simulado" ? " · dados do simulado" : ""}
          {error ? ` · ${error}` : ""}
        </p>
      </header>

      <div className="races">
        <RacePanel
          view={data?.races[PRESIDENT_ID] ?? null}
          waiting={waiting}
          rosterOnly={phase === "before"}
        />

        <RacePanel
          view={data?.races[stateRaceId("governador", stateId)] ?? null}
          waiting={waiting}
          rosterOnly={phase === "before"}
        />
      </div>

      <div className="rankings">
        {LIST_OFFICES.map((office) => (
          <RankingPanel
            key={office.id}
            title={office.title}
            view={data?.races[stateRaceId(office.id, stateId)] ?? null}
            waiting={waiting}
          />
        ))}
      </div>

      <footer>
        Fonte: arquivos oficiais de divulgação do TSE. A curva de tendência não é
        pesquisa nem resultado oficial.
      </footer>
    </main>
  );
}
