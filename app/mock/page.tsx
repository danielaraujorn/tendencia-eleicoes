import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { MOCK_READ_AT, mockApuracao } from "@/lib/mock-apuracao";

export const metadata: Metadata = {
  title: "Prévia · 30% no Brasil, 22% no RN",
};

export default function MockPage() {
  return (
    <Dashboard
      initialState="rn"
      initialPhase="during"
      preview={{ data: mockApuracao(), readAt: MOCK_READ_AT }}
    />
  );
}
