"use client";

import { Fragment } from "react";
import { CandidateName } from "@/components/candidate-name";
import { formatPercent } from "@/lib/format";
import { seatsLabel } from "@/lib/seats";
import type { RaceView } from "@/lib/types";

const PREVIEW = 6;

export function RankingPanel({
  view,
  title,
  waiting,
  rosterOnly = false,
  expanded,
  onToggle,
  seats,
}: {
  view: RaceView | null;
  title: string;
  waiting: string;
  rosterOnly?: boolean;
  expanded: boolean;
  onToggle: () => void;
  seats: number;
}) {
  const listed = view?.top ?? [];
  const showList = Boolean(view?.available && !rosterOnly && !view.zeroed && listed.length > 0);
  const visible = expanded ? listed : listed.slice(0, PREVIEW);
  const cutoffInView = seats > 0 && seats < listed.length && seats <= visible.length;
  const emptyCopy =
    view?.available && view.zeroed && !rosterOnly
      ? "Nenhum voto contabilizado ainda."
      : waiting;

  return (
    <section className="panel ranking">
      <header className="panel-head">
        <p className="kicker">{view?.title ?? title}</p>
        {showList && !cutoffInView ? (
          <p className="seat-note">{seatsLabel(seats)}</p>
        ) : null}
      </header>

      {showList ? (
        <>
          <ul className="candidates">
            {visible.map((candidate, index) => (
              <Fragment key={candidate.id}>
                <li className={index < seats ? "in-seat" : undefined}>
                  <CandidateName
                    number={candidate.number}
                    name={candidate.name}
                    party={candidate.party}
                  />
                  <span className="numbers">{formatPercent(candidate.percent)}</span>
                </li>
                {index === seats - 1 && cutoffInView ? (
                  <li className="seat-line">
                    <span>{seatsLabel(seats)}</span>
                  </li>
                ) : null}
              </Fragment>
            ))}
          </ul>
          {listed.length > PREVIEW ? (
            <button
              type="button"
              className="more"
              onClick={onToggle}
            >
              {expanded ? "Mostrar menos" : "Mostrar mais"}
            </button>
          ) : null}
        </>
      ) : (
        <p className="waiting">{emptyCopy}</p>
      )}
    </section>
  );
}
