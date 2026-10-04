"use client";

import type { ReactNode } from "react";
import { colorFor } from "@/lib/colors";
import { candidateLabel, formatGap, formatPercent, formatVotes } from "@/lib/format";
import type { RaceView } from "@/lib/types";
import { chartRows, RaceChart } from "./race-chart";

function leadText(view: RaceView) {
  if (!view.leader) return "Sem candidatos nesta leitura.";
  const leader = candidateLabel(view.leader.name, view.leader.party);
  if (!view.runnerUp || view.gap === null) {
    return `${leader} está com ${formatPercent(view.leader.percent)}.`;
  }
  if (Math.abs(view.gap) < 0.005) {
    return `${leader} e ${view.runnerUp.name} estão empatados, com ${formatPercent(view.leader.percent)}.`;
  }
  return `${leader} está na frente com ${formatPercent(view.leader.percent)}, a ${formatGap(view.gap)} de ${view.runnerUp.name}.`;
}

export function RacePanel({
  view,
  waiting,
  scope,
  rosterOnly = false,
}: {
  view: RaceView | null;
  waiting: string;
  scope?: ReactNode;
  rosterOnly?: boolean;
}) {
  const rows = view ? chartRows(view) : [];
  const listed = rosterOnly ? (view?.roster ?? []) : (view?.top ?? []);
  const ids = listed.map((candidate) => candidate.id);

  return (
    <section className="panel">
      <header className="panel-head">
        <p className="kicker">{view?.title ?? "Disputa"}</p>
        <h2>
          {scope ?? view?.scope ?? "—"}
        </h2>
      </header>

      {!view?.available ? (
        <p className="waiting">{waiting}</p>
      ) : rosterOnly ? null : (
        <div className="summary">
          <p className="pst">
            {formatPercent(view.pst ?? 0)}
            <span>das seções apuradas</span>
          </p>
          <p className="lead">
            {view.zeroed
              ? "Nenhum voto contabilizado ainda."
              : leadText(view)}
          </p>
          {view.sourceUpdatedAt ? (
            <p className="meta">Leitura do TSE: {view.sourceUpdatedAt}</p>
          ) : null}
        </div>
      )}

      {rosterOnly ? null : (
        <div className="chart-slot">
          {view?.available && !view.zeroed ? (
            <RaceChart view={view} rows={rows} ids={ids} />
          ) : null}
        </div>
      )}

      {view?.available ? (
        <div>
          <ul className={rosterOnly || view.zeroed ? "candidates roster" : "candidates"}>
            {listed.map((candidate) => {
              const trend = view.trends.find((item) => item.id === candidate.id);
              return (
                <li key={candidate.id}>
                  <span
                    className="swatch"
                    style={{ background: colorFor(candidate.id, ids, candidate.number) }}
                  />
                  <span>
                    <strong>
                      {candidate.number ? `${candidate.number} ` : ""}
                      {candidate.name}
                    </strong>
                    <small>
                      {candidate.party || "sem partido"}
                      {rosterOnly || view.zeroed ? null : (
                        <>
                          {candidate.destination && candidate.destination !== "Válido"
                            ? ` · ${candidate.destination}`
                            : ""}
                          {` · ${formatVotes(candidate.votes)} votos`}
                        </>
                      )}
                    </small>
                  </span>
                  {rosterOnly || view.zeroed ? null : (
                    <span className="numbers">
                      {formatPercent(candidate.percent)}
                      {trend ? (
                        <small>tendência {formatPercent(trend.projected)}</small>
                      ) : null}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {!rosterOnly && !view.zeroed && view.trends.length > 0 ? (
            <p className="note">
              A curva tracejada supõe que as seções que faltam repetem a
              composição recente dos votos e têm tamanho parecido com as já
              apuradas. Não é projeção oficial.
            </p>
          ) : null}
        </div>
      ) : (
        <div />
      )}
    </section>
  );
}
