import { describe, expect, it } from "vitest";

import { cleanChatAnswer, plainDashes } from "@/lib/ai-quality";
import { parseSummary, tidyExtract } from "@/lib/live/open-data";

describe("Wikipedia introductions read cleanly", () => {
  it("drops the pronunciation after the name", () => {
    expect(
      tidyExtract(
        "Nashville ( NASH-vil) is the capital and most populous city of the U.S. state of Tennessee.",
      ),
    ).toBe("Nashville is the capital and most populous city of the U.S. state of Tennessee.");
  });

  it("drops native spellings and IPA, but keeps later parentheses", () => {
    expect(
      tidyExtract(
        "Paris (French pronunciation: [paʁi] ) is the capital of France (by population, its largest city).",
      ),
    ).toBe("Paris is the capital of France (by population, its largest city).");
    expect(tidyExtract("Kyoto (Japanese: 京都; [kʲoːꜜto]) was the capital of Japan.")).toBe(
      "Kyoto was the capital of Japan.",
    );
  });

  it("swaps em dashes for commas", () => {
    expect(tidyExtract("The park is huge — over 500,000 acres.")).toBe(
      "The park is huge, over 500,000 acres.",
    );
  });

  it("applies when parsing a summary", () => {
    const s = parseSummary({
      query: {
        pages: {
          "1": { title: "Nashville", extract: "Nashville ( NASH-vil) is a city.", fullurl: "u" },
        },
      },
    });
    expect(s?.extract).toBe("Nashville is a city.");
  });
});

describe("AI answers never use em dashes", () => {
  it("rewrites dashes as plain punctuation", () => {
    expect(plainDashes("Great choice — let's pick dates.")).toBe("Great choice, let's pick dates.");
    expect(plainDashes("Sunny – warm days")).toBe("Sunny, warm days");
    expect(plainDashes("Ends with a dash —.")).toBe("Ends with a dash.");
  });

  it("cleans the assistant's reply, questions and ideas", () => {
    const a = cleanChatAnswer({
      reply: "Sounds fun — a few questions first.",
      ready: false,
      questions: [{ question: "When — this month or next?", options: ["This month — soon"] }],
      ideas: [{ name: "Asheville", why: "Mountains — and great food" }],
      trip: {
        destination: null,
        origin: null,
        tripType: null,
        startDate: null,
        endDate: null,
        month: null,
        nights: null,
        travelers: null,
        totalBudget: null,
        style: null,
        interests: [],
      } as never,
    });
    const text = JSON.stringify(a);
    expect(text).not.toContain("—");
    expect(a.reply).toBe("Sounds fun, a few questions first.");
  });
});
