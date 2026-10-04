"use client";

import { useEffect, useState } from "react";
import { RacePanel } from "@/components/race-panel";
import { RankingPanel } from "@/components/ranking-panel";
import { formatPercent } from "@/lib/format";
import {
  LIST_OFFICES,
  PRESIDENT_ID,
  STATE_COOKIE,
  STATE_OPTIONS,
  isStateId,
  stateRaceId,
  type StateId,
} from "@/lib/labels";
import {
  POLL_END_MS,
  POLL_INTERVAL_MS,
  POLL_START_MS,
  pollPhase,
  type PollPhase,
} from "@/lib/poll";
import type {
  ApuracaoResponse,
  RaceView,
} from "@/lib/types";

function waitingCopy(
  source: ApuracaoResponse["source"] | null,
) {
  if (source === "simulado")
    return "Aguardando a leitura do simulado do TSE.";
  return "Aguardando o TSE. A divulgação começa às 17h, horário de Brasília.";
}

function clockInBrasilia(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function officeHeading(
  office: (typeof LIST_OFFICES)[number],
  stateId: StateId,
) {
  if (office.id === "deputado-estadual" && stateId === "df") {
    return "Deputado Distrital";
  }
  return office.title;
}

function countedPercent(
  view: RaceView | null | undefined,
  rosterOnly: boolean,
) {
  if (rosterOnly || !view?.available || view.pst == null)
    return null;
  return view.pst;
}

function samePercent(
  left: number | null,
  right: number | null,
) {
  return (
    left != null &&
    right != null &&
    Math.abs(left - right) < 0.005
  );
}

function sourceOrder(value: string) {
  const match =
    /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      value,
    );
  if (!match) return Number.NaN;
  const [, day, month, year, hour = "0", minute = "0", second = "0"] =
    match;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

function latestSourceReading(
  views: (RaceView | null | undefined)[],
) {
  let latest: string | null = null;
  let latestOrder = Number.NEGATIVE_INFINITY;
  for (const view of views) {
    if (!view?.available || !view.sourceUpdatedAt) continue;
    const order = sourceOrder(view.sourceUpdatedAt);
    if (
      latest == null ||
      (Number.isFinite(order) && order > latestOrder)
    ) {
      latest = view.sourceUpdatedAt;
      if (Number.isFinite(order)) latestOrder = order;
    }
  }
  return latest;
}

export function Dashboard({
  initialState,
  initialPhase,
  preview,
}: {
  initialState: StateId;
  initialPhase: PollPhase;
  preview?: { data: ApuracaoResponse; readAt: string };
}) {
  const [data, setData] = useState<ApuracaoResponse | null>(
    preview?.data ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(
    preview ? new Date(preview.readAt) : null,
  );
  const [phase, setPhase] =
    useState<PollPhase>(initialPhase);
  const [stateId, setStateId] =
    useState<StateId>(initialState);

  useEffect(() => {
    if (preview) return;

    let active = true;
    let intervalId: number | undefined;
    let startId: number | undefined;
    let stopId: number | undefined;

    async function pull() {
      try {
        const response = await fetch("/api/apuracao", {
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error("Falha ao carregar");
        const body =
          (await response.json()) as ApuracaoResponse;
        if (!active) return;
        setData(body);
        setError(null);
        setFetchedAt(new Date());
      } catch {
        if (active)
          setError("Não foi possível atualizar agora.");
      }
    }

    function begin() {
      if (!active) return;
      setPhase("during");
      void pull();
      intervalId = window.setInterval(
        () => void pull(),
        POLL_INTERVAL_MS,
      );
      stopId = window.setTimeout(
        () => {
          if (intervalId !== undefined)
            window.clearInterval(intervalId);
          intervalId = undefined;
          if (active) setPhase("after");
        },
        Math.max(0, POLL_END_MS - Date.now()),
      );
    }

    const now = Date.now();
    const current = pollPhase(now);
    if (current === "after") {
      setPhase("after");
      void pull();
    } else if (current === "during") {
      begin();
    } else {
      setPhase("before");
      void pull();
      startId = window.setTimeout(
        begin,
        POLL_START_MS - now,
      );
    }

    return () => {
      active = false;
      if (intervalId !== undefined)
        window.clearInterval(intervalId);
      if (startId !== undefined)
        window.clearTimeout(startId);
      if (stopId !== undefined) window.clearTimeout(stopId);
    };
  }, [preview]);

  const waiting = waitingCopy(data?.source ?? null);
  const capturedClock = data?.capturedAt
    ? clockInBrasilia(data.capturedAt)
    : null;
  const pageClock = fetchedAt ? clockInBrasilia(fetchedAt) : null;
  const rosterOnly = phase === "before";
  const nationalPst = countedPercent(
    data?.races[PRESIDENT_ID],
    rosterOnly,
  );
  const stateLabel =
    STATE_OPTIONS.find((option) => option.id === stateId)
      ?.label ?? "";
  const statePst = countedPercent(
    data?.races[stateRaceId("governador", stateId)] ??
      LIST_OFFICES.map(
        (office) =>
          data?.races[stateRaceId(office.id, stateId)],
      ).find(
        (view) => countedPercent(view, rosterOnly) != null,
      ),
    rosterOnly,
  );
  const sharedPst = samePercent(nationalPst, statePst);
  const reading = rosterOnly
    ? null
    : latestSourceReading([
        data?.races[PRESIDENT_ID],
        data?.races[stateRaceId("governador", stateId)],
        ...LIST_OFFICES.map(
          (office) =>
            data?.races[stateRaceId(office.id, stateId)],
        ),
      ]);

  return (
    <main>
      {preview ? (
        <p className="preview-banner">
          Prévia ilustrativa com nomes fictícios. 30% das
          seções apuradas no Brasil e 22% no Rio Grande do
          Norte.
        </p>
      ) : null}
      <header className="masthead">
        <p className="kicker">Eleições 2026 · 1º turno</p>
        <h1>Tendência da apuração</h1>
        <p className="deck">
          O percentual de cada candidatura conforme as
          seções vão sendo totalizadas. A página se atualiza
          sozinha.
        </p>
        {nationalPst != null || statePst != null ? (
          <div className="progress">
            {nationalPst != null ? (
              <p className="pst">
                {formatPercent(nationalPst)}
                <span>
                  {sharedPst
                    ? "das seções apuradas"
                    : "das seções apuradas no Brasil"}
                </span>
              </p>
            ) : null}
            {statePst != null && !sharedPst ? (
              <p
                className={
                  nationalPst == null ? "pst" : "pst pst-local"
                }
              >
                {formatPercent(statePst)}
                <span>
                  {nationalPst == null
                    ? `das seções apuradas em ${stateLabel}`
                    : `em ${stateLabel}`}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="state-bar">
          <label className="kicker" htmlFor="estado">
            Estado
          </label>
          <select
            id="estado"
            className="scope-select"
            value={stateId}
            onChange={(event) => {
              const next = event.target.value;
              if (!isStateId(next)) return;
              if (!preview) {
                document.cookie = `${STATE_COOKIE}=${next}; path=/; samesite=lax`;
              }
              setStateId(next);
            }}
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
            : capturedClock
              ? `Dados capturados às ${capturedClock}`
              : pageClock
                ? `Página atualizada às ${pageClock}`
                : "Carregando a série…"}
          {data?.source === "simulado"
            ? " · dados do simulado"
            : ""}
          {reading ? ` · Leitura do TSE: ${reading}` : ""}
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
          view={
            data?.races[
              stateRaceId("governador", stateId)
            ] ?? null
          }
          waiting={waiting}
          rosterOnly={phase === "before"}
        />
      </div>

      <div className="rankings">
        {LIST_OFFICES.map((office) => (
          <RankingPanel
            key={office.id}
            title={officeHeading(office, stateId)}
            view={
              data?.races[
                stateRaceId(office.id, stateId)
              ] ?? null
            }
            waiting={waiting}
            rosterOnly={phase === "before"}
          />
        ))}
      </div>

      <footer>
        Fonte: arquivos oficiais de divulgação do TSE. A
        curva de tendência não é pesquisa nem resultado
        oficial.
      </footer>
    </main>
  );
}
