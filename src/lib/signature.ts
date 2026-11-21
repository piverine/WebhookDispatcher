import crypto from "node:crypto";

/**
 * Computes HMAC SHA-256 hex digest for webhook payload.
 */
export function signPayload(payloadString: string, secret: string): string {
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(payloadString).digest("hex");
}

