import { headers } from "next/headers";
import { getCachedApuracao } from "@/lib/series";

export async function GET() {
  await headers();
  const data = await getCachedApuracao();
  return Response.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
