import { config } from "../config.js";

/**
 * Validates whether a destination URL is safe to dispatch to (SSRF guard).
 * 
 * Rules:
 * - Allowed protocols: http, https
 * - Block private/local hosts unless ALLOW_PRIVATE_DESTINATIONS=true:
 *   localhost, 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1
 */
export function validateDestinationUrl(urlString: string, allowPrivate = config.allowPrivateDestinations): {
  valid: boolean;
  reason?: string;
  url?: URL;
} {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, reason: "invalid_url_format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: "unsupported_protocol" };
  }

  if (allowPrivate) {
    return { valid: true, url: parsed };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check localhost / IPv6 loopback
  if (hostname === "localhost" || hostname === "::1" || hostname === "[::1]") {
    return { valid: false, reason: "private_host_not_allowed" };
  }

  // Check IPv4 ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = [
      Number(ipv4Match[1]),
      Number(ipv4Match[2]),
      Number(ipv4Match[3]),
      Number(ipv4Match[4]),
    ];

    if (octets.some((o) => o < 0 || o > 255)) {
      return { valid: false, reason: "invalid_ip_address" };
    }

    // 127.0.0.0/8
    if (octets[0] === 127) {
      return { valid: false, reason: "private_host_not_allowed" };
    }
    // 10.0.0.0/8
    if (octets[0] === 10) {
      return { valid: false, reason: "private_host_not_allowed" };
    }
    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
      return { valid: false, reason: "private_host_not_allowed" };
    }
    // 192.168.0.0/16
    if (octets[0] === 192 && octets[1] === 168) {
      return { valid: false, reason: "private_host_not_allowed" };
    }
    // 169.254.0.0/16 (link-local)
    if (octets[0] === 169 && octets[1] === 254) {
      return { valid: false, reason: "private_host_not_allowed" };
    }
    // 0.0.0.0/8
    if (octets[0] === 0) {
      return { valid: false, reason: "private_host_not_allowed" };
    }
  }

  return { valid: true, url: parsed };
}

