export type Candidate = {
  id: string;
  number: string;
  name: string;
  party: string;
  votes: number;
  percent: number;
  seq: number;
  destination: string;
};

export type RaceView = {
  id: string;
  title: string;
  scope: string;
  available: boolean;
  pst: number | null;
  finalized: boolean;
  sourceUpdatedAt: string | null;
  leader: { name: string; party: string; percent: number } | null;
  runnerUp: { name: string; percent: number } | null;
  gap: number | null;
  zeroed: boolean;
  top: Candidate[];
  others: Candidate[];
  roster: Candidate[];
  points: { pst: number; percents: Record<string, number> }[];
  trends: { id: string; projected: number; marginal: number }[];
  crossover: { pst: number; at: string; readAt: string } | null;
};

export type ApuracaoResponse = {
  source: "oficial" | "simulado";
  races: Record<string, RaceView>;
};
