export type Candidate = {
  id: string;
  number: string;
  name: string;
  party: string;
  votes: number;
  percent: number;
  seq: number;
  destination: string;
  elected?: boolean;
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
  trends: { id: string; projected: number }[];
  crossover: { pst: number; at: string; readAt: string } | null;
};

export type RegionView = {
  id: string;
  label: string;
  pst: number | null;
};

export type RoundView = {
  races: Record<string, RaceView>;
  regions: RegionView[];
};

export type ApuracaoResponse = {
  source: "oficial" | "simulado";
  capturedAt: string | null;
  rounds: Record<"1" | "2", RoundView>;
};
