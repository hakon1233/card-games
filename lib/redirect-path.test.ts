import { describe, it, expect } from "vitest";
import { redirectPath } from "./redirect-path";

describe("redirectPath (where sign-in may send the user next)", () => {
  it("keeps same-site paths, query included", () => {
    expect(redirectPath("/rooms/ABC234")).toBe("/rooms/ABC234");
    expect(redirectPath("/%09/evil.example")).toBe("/%09/evil.example");
    expect(redirectPath("/play/yaniv?mode=friends")).toBe("/play/yaniv?mode=friends");
  });

  it("falls back to home for anything that could leave the site", () => {
    for (const next of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "\t//evil.example",
      "/.//evil.example",
      "/%2e//evil.example",
      "/a/..//evil.example",
      "/./\\evil.example",
      "@evil.example",
      ".evil.example",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ]) {
      expect(redirectPath(next)).toBe("/");
    }
  });
});
