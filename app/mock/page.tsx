import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { MOCK_READ_AT, mockFirstApuracao } from "@/lib/mock-apuracao";

export const metadata: Metadata = {
  title: "Prévia · 1º turno",
};

export default function MockPage() {
  return (
    <Dashboard
      initialState="rn"
      initialPhase="during"
      round={1}
      preview={{
        data: mockFirstApuracao(),
        readAt: MOCK_READ_AT,
        note: "Prévia ilustrativa do 1º turno, com nomes fictícios. 30% das seções apuradas no Brasil e 22% no Rio Grande do Norte.",
      }}
    />
  );
}
