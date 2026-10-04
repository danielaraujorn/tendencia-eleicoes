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
