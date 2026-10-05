"use client";

import { Fragment, useState } from "react";
import { CandidateName } from "@/components/candidate-name";
import { formatPercent, formatVotes } from "@/lib/format";
import { seatsLabel } from "@/lib/seats";
import type { RaceView } from "@/lib/types";

const PREVIEW = 6;

export function RankingPanel({
  view,
  title,
  waiting,
  rosterOnly = false,
  seats,
}: {
  view: RaceView | null;
  title: string;
  waiting: string;
  rosterOnly?: boolean;
  seats: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const listed = view?.top ?? [];
  const showList = Boolean(
    view?.available && !rosterOnly && !view.zeroed && listed.length > 0,
  );
  const visible = expanded ? listed : listed.slice(0, PREVIEW);
  const electedMode = listed.some((candidate) => candidate.elected);
  const cutoffInView =
    !electedMode && seats > 0 && seats < listed.length && seats <= visible.length;
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
            {visible.map((candidate, index) => {
              const inSeat = electedMode ? Boolean(candidate.elected) : index < seats;
              return (
                <Fragment key={candidate.id}>
                  <li className={inSeat ? "in-seat" : undefined}>
                    <CandidateName
                      number={candidate.number}
                      name={candidate.name}
                      party={candidate.party}
                    />
                    <span className="numbers">
                      {formatPercent(candidate.percent)}
                      <span className="vote-count">{formatVotes(candidate.votes)}</span>
                    </span>
                  </li>
                  {index === seats - 1 && cutoffInView ? (
                    <li className="seat-line">
                      <span>{seatsLabel(seats)}</span>
                    </li>
                  ) : null}
                </Fragment>
              );
            })}
          </ul>
          {listed.length > PREVIEW ? (
            <button
              type="button"
              className="more"
              onClick={() => setExpanded((open) => !open)}
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
