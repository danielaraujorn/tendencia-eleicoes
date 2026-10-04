"use client";

import { CandidateName } from "@/components/candidate-name";
import { formatPercent } from "@/lib/format";
import type { RaceView } from "@/lib/types";

export function RankingPanel({
  view,
  title,
  waiting,
}: {
  view: RaceView | null;
  title: string;
  waiting: string;
}) {
  const listed = view?.top ?? [];
  const showList = Boolean(view?.available && !view.zeroed && listed.length > 0);

  return (
    <section className="panel ranking">
      <header className="panel-head">
        <p className="kicker">{view?.title ?? title}</p>
      </header>

      {view?.available && view.pst != null ? (
        <p className="meta sections">{formatPercent(view.pst)} das seções apuradas</p>
      ) : null}

      {showList ? (
        <ul className="candidates">
          {listed.map((candidate) => (
            <li key={candidate.id}>
              <CandidateName
                number={candidate.number}
                name={candidate.name}
                party={candidate.party}
              />
              <span className="numbers">{formatPercent(candidate.percent)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="waiting">{waiting}</p>
      )}
    </section>
  );
}
