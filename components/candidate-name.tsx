export function CandidateName({
  number,
  name,
  party,
}: {
  number: string;
  name: string;
  party: string;
}) {
  return (
    <span className="candidate-name">
      <strong>
        {number ? `${number} ` : ""}
        {name}
      </strong>
      <span className="party"> ({party || "sem partido"})</span>
    </span>
  );
}
