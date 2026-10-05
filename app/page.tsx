import { Dashboard } from "@/components/dashboard";
import { STATE_HEADER, stateFromCookie } from "@/lib/labels";
import { pollPhase } from "@/lib/poll";
import { configuredRound } from "@/lib/races";
import { headers } from "next/headers";

export const instant = false;

export default async function Page() {
  const headerStore = await headers();
  return (
    <Dashboard
      initialState={stateFromCookie(headerStore.get(STATE_HEADER))}
      initialPhase={pollPhase(Date.now())}
      round={configuredRound()}
    />
  );
}
