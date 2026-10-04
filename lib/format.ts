export function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function formatGap(value: number) {
  return `${Math.abs(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} p.p.`;
}

export function formatVotes(value: number) {
  return value.toLocaleString("pt-BR");
}

export function candidateLabel(name: string, party: string) {
  return party ? `${name} (${party})` : name;
}

export function formatArrival(at: Date, reference: Date, timeZone: string) {
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  if (dayKey.format(at) === dayKey.format(reference)) return time;
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
  }).format(at);
  return `${date} ${time}`;
}
