import { describe, expect, it } from "vitest";
import {
  decryptViewerEmail,
  encryptViewerEmail,
  normalizeViewerEmail,
  viewerIdentityKey,
} from "../src/services/viewer-identity.js";

const config = {
  APP_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 23).toString("base64"),
};

describe("viewer identity protection", () => {
  it("normalizes and blind-indexes viewer email", () => {
    const email = normalizeViewerEmail("  Viewer@Example.COM ");
    expect(email).toBe("viewer@example.com");
    const first = viewerIdentityKey(email, config);
    const second = viewerIdentityKey(email, config);
    expect(first).toBe(second);
    expect(first).toMatch(/^email_hmac_v1_[a-f0-9]{64}$/);
    expect(first).not.toContain("viewer@example.com");
  });

  it("encrypts viewer email with tenant-bound context", () => {
    const encrypted = encryptViewerEmail("viewer@example.com", "tenant-a", config);
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain("viewer@example.com");
    expect(decryptViewerEmail(encrypted, "tenant-a", config)).toBe("viewer@example.com");
    expect(decryptViewerEmail(encrypted, "tenant-b", config)).toBeNull();
  });
});
