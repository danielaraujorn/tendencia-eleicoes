import { timingSafeEqual } from "crypto";

export function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const received = Buffer.from(header);
  const valid = Buffer.from(expected);
  if (received.length !== valid.length) return false;
  return timingSafeEqual(received, valid);
}
