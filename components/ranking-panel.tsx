"use client";

import { useState } from "react";
import { CandidateName } from "@/components/candidate-name";
import { formatPercent } from "@/lib/format";
import type { RaceView } from "@/lib/types";

const PREVIEW = 6;

export function RankingPanel({
  view,
  title,
  waiting,
}: {
  view: RaceView | null;
  title: string;
  waiting: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const listed = view?.top ?? [];
  const showList = Boolean(view?.available && !view.zeroed && listed.length > 0);
  const visible = expanded ? listed : listed.slice(0, PREVIEW);

  return (
    <section className="panel ranking">
      <header className="panel-head">
        <p className="kicker">{view?.title ?? title}</p>
      </header>

      {view?.available && view.pst != null ? (
        <p className="meta sections">{formatPercent(view.pst)} das seções apuradas</p>
      ) : null}

      {showList ? (
        <>
          <ul className="candidates">
            {visible.map((candidate) => (
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
        <p className="waiting">{waiting}</p>
      )}
    </section>
  );
}
