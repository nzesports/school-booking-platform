import { createHash, createHmac, randomBytes } from "node:crypto";

export const ACCESS_COOKIE = "booking-management-v4";
export const CHALLENGE_COOKIE = "booking-verification-v4";
export const SESSION_SECONDS = 30 * 60;
export const CHANGE_NOTICE_HOURS = 24;

export function newAccessSecret() { return randomBytes(32).toString("base64url"); }
export function validAccessSecret(value: string) { return /^[A-Za-z0-9_-]{43}$/.test(value); }
export function hashAccessSecret(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function privateRateKey(kind: string, value: string, secret: string) {
  return createHmac("sha256", secret).update(`booking-rate:v1:${kind}:${value}`).digest("hex");
}
