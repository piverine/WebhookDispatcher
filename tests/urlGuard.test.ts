import { describe, it, expect } from "vitest";
import { validateDestinationUrl } from "../src/lib/urlGuard.js";

describe("Phase 6: URL Guard (SSRF Protection)", () => {
  it("allows valid public http and https URLs", () => {
    expect(validateDestinationUrl("https://api.github.com/webhook", false).valid).toBe(true);
    expect(validateDestinationUrl("http://example.com/events", false).valid).toBe(true);
    expect(validateDestinationUrl("https://sub.domain.org:8443/hook", false).valid).toBe(true);
  });

  it("rejects non-http/https protocols", () => {
    expect(validateDestinationUrl("ftp://example.com/file", false).valid).toBe(false);
    expect(validateDestinationUrl("file:///etc/passwd", false).valid).toBe(false);
    expect(validateDestinationUrl("javascript:alert(1)", false).valid).toBe(false);
    expect(validateDestinationUrl("mailto:user@example.com", false).valid).toBe(false);
  });

  it("blocks localhost and IPv6 loopback", () => {
    expect(validateDestinationUrl("http://localhost/hook", false).valid).toBe(false);
    expect(validateDestinationUrl("http://localhost:3000/hook", false).valid).toBe(false);
    expect(validateDestinationUrl("http://[::1]/hook", false).valid).toBe(false);
  });

  it("blocks private IPv4 address ranges", () => {
    // 127.0.0.0/8 (loopback)
    expect(validateDestinationUrl("http://127.0.0.1/hook", false).valid).toBe(false);
    expect(validateDestinationUrl("http://127.255.0.1/hook", false).valid).toBe(false);

    // 10.0.0.0/8 (private)
    expect(validateDestinationUrl("http://10.0.0.1/hook", false).valid).toBe(false);
    expect(validateDestinationUrl("http://10.254.1.1/hook", false).valid).toBe(false);

    // 172.16.0.0/12 (private)
    expect(validateDestinationUrl("http://172.16.0.1/hook", false).valid).toBe(false);
    expect(validateDestinationUrl("http://172.31.255.255/hook", false).valid).toBe(false);

    // 192.168.0.0/16 (private)
    expect(validateDestinationUrl("http://192.168.1.1/hook", false).valid).toBe(false);
    expect(validateDestinationUrl("http://192.168.0.254/hook", false).valid).toBe(false);

    // 169.254.0.0/16 (link-local)
    expect(validateDestinationUrl("http://169.254.169.254/metadata", false).valid).toBe(false);

    // 0.0.0.0/8
    expect(validateDestinationUrl("http://0.0.0.0/hook", false).valid).toBe(false);
  });

  it("allows private targets when allowPrivate=true", () => {
    expect(validateDestinationUrl("http://localhost:3000/hook", true).valid).toBe(true);
    expect(validateDestinationUrl("http://127.0.0.1:8080/hook", true).valid).toBe(true);
    expect(validateDestinationUrl("http://10.0.0.5/hook", true).valid).toBe(true);
  });

  it("rejects malformed URLs", () => {
    expect(validateDestinationUrl("not-a-valid-url", false).valid).toBe(false);
    expect(validateDestinationUrl("://bad", false).valid).toBe(false);
  });
});
