import { describe, expect, it } from "vitest";

describe("thumbAt only asks Wikimedia for widths it serves", () => {
  const url =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Rainy_Blue_Ridge-27527.jpg/960px-Rainy_Blue_Ridge-27527.jpg";
  it("rounds any request up to a standard width", async () => {
    const { thumbAt } = await import("@/lib/live/open-data");
    expect(thumbAt(url, 400)).toContain("/500px-");
    expect(thumbAt(url, 560)).toContain("/960px-");
    expect(thumbAt(url, 500)).toContain("/500px-");
    expect(thumbAt(url, 5000)).toContain("/1920px-");
    expect(thumbAt(url, 100)).toContain("/250px-");
  });
});
