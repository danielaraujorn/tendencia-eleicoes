"use client";

import { useState } from "react";
import { CandidateName } from "@/components/candidate-name";
import { colorFor } from "@/lib/colors";
import { formatPercent, formatVotes } from "@/lib/format";
import { raceReading } from "@/lib/reading";
import type { RaceView } from "@/lib/types";
import { chartRows, RaceChart } from "./race-chart";

const LIST_PREVIEW = 2;
const LIST_EXPANDED = 6;

export function RacePanel({
  view,
  waiting,
  rosterOnly = false,
  scopeToggle,
}: {
  view: RaceView | null;
  waiting: string;
  rosterOnly?: boolean;
  scopeToggle?: {
    value: "br" | "uf";
    stateLabel: string;
    onChange: (value: "br" | "uf") => void;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = view ? chartRows(view) : [];
  const pool = rosterOnly
    ? (view?.roster ?? [])
    : (view?.top ?? []);
  const countable = Boolean(
    view?.available && !rosterOnly && !view.zeroed,
  );
  const listed = countable
    ? pool.slice(0, expanded ? LIST_EXPANDED : LIST_PREVIEW)
    : pool;
  const ids = pool.map((candidate) => candidate.id);
  const reading = view && countable ? raceReading(view) : null;

  return (
    <section className="panel">
      <header className="panel-head">
        <p className="kicker">{view?.title ?? "Disputa"}</p>
        {scopeToggle ? (
          <div
            className="choice-toggle"
            role="group"
            aria-label="Apuração de presidente"
          >
            <button
              type="button"
              aria-pressed={scopeToggle.value === "br"}
              onClick={() => scopeToggle.onChange("br")}
            >
              Geral
            </button>
            <button
              type="button"
              aria-pressed={scopeToggle.value === "uf"}
              onClick={() => scopeToggle.onChange("uf")}
            >
              Estadual
            </button>
          </div>
        ) : (
          <h2>{view?.scope ?? "—"}</h2>
        )}
        {reading ? <p className="reading">{reading}</p> : null}
      </header>

      {!view?.available ? (
        <p className="waiting">{waiting}</p>
      ) : null}

      {rosterOnly ? null : (
        <div className="chart-slot">
          {view?.available && !view.zeroed ? (
            <RaceChart view={view} rows={rows} ids={ids} />
          ) : null}
        </div>
      )}

      {view?.available ? (
        <div>
          <ul
            className={
              rosterOnly || view.zeroed
                ? "candidates roster"
                : "candidates"
            }
          >
            {listed.map((candidate) => {
              const trend = view.trends.find(
                (item) => item.id === candidate.id,
              );
              return (
                <li key={candidate.id}>
                  <span
                    className="swatch"
                    style={{
                      background: colorFor(
                        candidate.id,
                        ids,
                        candidate.number,
                      ),
                    }}
                  />
                  <span>
                    <CandidateName
                      number={candidate.number}
                      name={candidate.name}
                      party={candidate.party}
                    />
                    {rosterOnly || view.zeroed ? null : (
                      <small>
                        {candidate.destination &&
                        candidate.destination !== "Válido"
                          ? `${candidate.destination} · `
                          : ""}
                        {formatVotes(candidate.votes)} votos
                      </small>
                    )}
                  </span>
                  {rosterOnly || view.zeroed ? null : (
                    <span className="numbers">
                      {formatPercent(candidate.percent)}
                      {trend ? (
                        <small>
                          tendência{" "}
                          {formatPercent(trend.projected)}
                        </small>
                      ) : null}
                    </span>
                  )}
                </li>
              );
            })}
            {!rosterOnly && !view.zeroed
              ? view.others.map((candidate) => (
                  <li key={candidate.id} className="other">
                    <CandidateName
                      number={candidate.number}
                      name={candidate.name}
                      party={candidate.party}
                    />
                    <span className="numbers">
                      {formatPercent(candidate.percent)}
                    </span>
                  </li>
                ))
              : null}
          </ul>
          {countable && pool.length > LIST_PREVIEW ? (
            <button
              type="button"
              className="more"
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? "Mostrar menos" : "Mostrar mais"}
            </button>
          ) : null}
        </div>
      ) : (
        <div />
      )}
    </section>
  );
}
