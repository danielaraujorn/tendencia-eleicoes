"use client";

import { useEffect, useState } from "react";
import { RacePanel } from "@/components/race-panel";
import { RankingPanel } from "@/components/ranking-panel";
import { RegionsPanel } from "@/components/regions-panel";
import { formatPercent } from "@/lib/format";
import {
  LIST_OFFICES,
  PRESIDENT_ID,
  STATE_COOKIE,
  STATE_OPTIONS,
  isStateId,
  presidentStateId,
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
import { seatsFor } from "@/lib/seats";
import type {
  ApuracaoResponse,
  RaceView,
} from "@/lib/types";
import { governorRunoff } from "@/lib/view";

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
  round = 1,
}: {
  initialState: StateId;
  initialPhase: PollPhase;
  round?: 1 | 2;
  preview?: { data: ApuracaoResponse; readAt: string; note: string };
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
  const [presidentScope, setPresidentScope] = useState<"br" | "uf">("br");

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
  const roundKey = round === 1 ? "1" : "2";
  const roundRaces = data?.rounds[roundKey].races;
  const firstRaces = data?.rounds["1"].races;
  const stateLabel =
    STATE_OPTIONS.find((option) => option.id === stateId)
      ?.label ?? "";
  const firstGovernor =
    firstRaces?.[stateRaceId("governador", stateId)] ?? null;
  const runoff = governorRunoff(firstGovernor);
  const dualPresident = round === 2 && runoff === "no";
  const nationalView = roundRaces?.[PRESIDENT_ID] ?? null;
  const statePresident =
    roundRaces?.[presidentStateId(stateId)] ?? null;
  const presidentView =
    !dualPresident && presidentScope === "uf" ? statePresident : nationalView;
  const nationalPst = countedPercent(nationalView, rosterOnly);
  const statePst = countedPercent(
    dualPresident
      ? statePresident
      : round === 1
        ? (roundRaces?.[stateRaceId("governador", stateId)] ??
          LIST_OFFICES.map(
            (office) => roundRaces?.[stateRaceId(office.id, stateId)],
          ).find((view) => countedPercent(view, rosterOnly) != null))
        : roundRaces?.[stateRaceId("governador", stateId)],
    rosterOnly,
  );
  const sharedPst = samePercent(nationalPst, statePst);
  const reading = rosterOnly
    ? null
    : latestSourceReading([
        nationalView,
        dualPresident
          ? statePresident
          : roundRaces?.[stateRaceId("governador", stateId)],
        ...(round === 1
          ? LIST_OFFICES.map(
              (office) => roundRaces?.[stateRaceId(office.id, stateId)],
            )
          : []),
      ]);

  return (
    <main>
      {preview ? (
        <p className="preview-banner">{preview.note}</p>
      ) : null}
      <header className="masthead">
        <div className="masthead-copy">
        <p className="kicker">
          {round === 2 ? "Eleições 2026 · 2º turno" : "Eleições 2026"}
        </p>
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
                className="pst"
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
        </div>
        <RegionsPanel
          regions={data?.rounds[roundKey]?.regions ?? []}
          races={roundRaces}
          national={nationalView}
        />
      </header>

      <div className="races">
        <RacePanel
          key={dualPresident ? "presidente-br" : `presidente-${presidentScope}`}
          view={dualPresident ? nationalView : presidentView}
          waiting={waiting}
          rosterOnly={rosterOnly}
          scopeToggle={
            dualPresident
              ? undefined
              : {
                  value: presidentScope,
                  stateLabel,
                  onChange: setPresidentScope,
                }
          }
        />
        {dualPresident ? (
          <RacePanel
            key={`presidente-${stateId}`}
            view={statePresident}
            waiting={waiting}
            rosterOnly={rosterOnly}
          />
        ) : round === 2 && runoff === "unknown" ? (
          <section className="panel">
            <header className="panel-head">
              <p className="kicker">Governador</p>
              <h2>{stateLabel}</h2>
            </header>
            <p className="waiting">
              O segundo turno em {stateLabel} ainda não está definido.
            </p>
          </section>
        ) : (
          <RacePanel
            key={`governador-${stateId}-${round}`}
            view={
              roundRaces?.[stateRaceId("governador", stateId)] ?? null
            }
            waiting={waiting}
            rosterOnly={rosterOnly}
          />
        )}
      </div>

      {round === 1 ? (
        <div className="rankings">
          {LIST_OFFICES.map((office) => (
            <RankingPanel
              key={office.id}
              title={officeHeading(office, stateId)}
              view={
                roundRaces?.[stateRaceId(office.id, stateId)] ?? null
              }
              waiting={waiting}
              rosterOnly={rosterOnly}
              seats={seatsFor(office.id, stateId)}
            />
          ))}
        </div>
      ) : null}

      <footer>
        Fonte: arquivos oficiais de divulgação do TSE. A
        reta de tendência não é pesquisa nem resultado
        oficial.
      </footer>
    </main>
  );
}
