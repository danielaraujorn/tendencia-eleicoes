import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { MOCK_SECOND_READ_AT, mockSecondApuracao } from "@/lib/mock-apuracao";

export const metadata: Metadata = {
  title: "Prévia · 2º turno",
};

export default function MockSecondPage() {
  return (
    <Dashboard
      initialState="rn"
      initialPhase="during"
      round={2}
      preview={{
        data: mockSecondApuracao(),
        readAt: MOCK_SECOND_READ_AT,
        note: "Prévia ilustrativa do 2º turno. No Rio Grande do Norte o governador saiu no 1º turno. São Paulo está no 2º turno.",
      }}
    />
  );
}
