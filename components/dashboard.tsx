"use client";

import { useEffect, useState } from "react";
import { RacePanel } from "@/components/race-panel";
import { GOVERNOR_OPTIONS, PRESIDENT_ID, type GovernorId } from "@/lib/labels";
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
  const [stateId, setStateId] = useState<GovernorId>("governador-rn");

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
          view={data?.races[stateId] ?? null}
          waiting={waiting}
          rosterOnly={phase === "before"}
          scope={
            <select
              className="scope-select"
              aria-label="Estado"
              value={stateId}
              onChange={(event) => setStateId(event.target.value as GovernorId)}
            >
              {GOVERNOR_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          }
        />
      </div>

      <footer>
        Fonte: arquivos oficiais de divulgação do TSE. A curva de tendência não é
        pesquisa nem resultado oficial.
      </footer>
    </main>
  );
}
