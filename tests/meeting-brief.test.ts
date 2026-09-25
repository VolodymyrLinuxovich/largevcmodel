import { describe, expect, it } from "vitest";
import { assembleMeetingBrief, briefTitle } from "@/lib/briefs/assemble";
import { classifyClaim } from "@/lib/evidence/classify";
import { safeExternalUrl } from "@/lib/evidence/safe-url";
import { claim, DAY, daysAgo, emptyBundle, NOW, person } from "./fixtures/evidence-bundle";

describe("meeting brief assembly with partial information", () => {
  it("produces a complete, honest brief from a company name alone", () => {
    const brief = assembleMeetingBrief(emptyBundle());

    expect(brief.facts.companyOverview).toEqual([]);
    expect(brief.facts.research).toEqual([]);
    expect(brief.facts.people).toEqual([]);
    expect(brief.facts.warmIntroductions).toEqual([]);
    expect(brief.facts.thesis).toMatchObject({ status: "NO_THESIS" });
    expect(brief.facts.keyFacts.every((fact) => fact.status === "UNAVAILABLE")).toBe(true);
    expect(brief.missingInformation).toEqual(
      expect.arrayContaining([
        "Revenue: not established by any stored evidence.",
        "Valuation: not established by any stored evidence.",
        "No people are linked to this opportunity.",
        "No research claims are stored for this company or its linked people.",
      ]),
    );
    expect(brief.sources).toEqual([]);
  });

  it("only generates questions for missing facts and labels them as generated with a basis", () => {
    const brief = assembleMeetingBrief(emptyBundle());

    expect(brief.generated.questions.length).toBeGreaterThan(0);
    for (const item of [...brief.generated.questions, ...brief.generated.concerns]) {
      expect(item.kind).toBe("GENERATED_SUGGESTION");
      expect(item.basis.length).toBeGreaterThan(0);
    }
    expect(brief.generated.questions.map((question) => question.text)).toContain("What is current revenue or ARR, and how is it recognized?");
  });

  it("reports missing integrations instead of implying there was no contact", () => {
    const brief = assembleMeetingBrief(emptyBundle({ coverage: { gmailConnected: false, calendarConnected: false } }));

    expect(brief.missingInformation).toContain("Gmail is not connected; email history may be incomplete.");
    expect(brief.missingInformation).toContain("Google Calendar is not connected; meeting history may be incomplete.");
  });
});

describe("meeting brief provenance", () => {
  const claims = [
    claim({ id: "c-public", text: "Acme reported $2M ARR in 2026.", category: "revenue", provenance: "PUBLIC_RESEARCH", sources: [{ id: "s1", url: "https://news.example.com/acme" }] }),
    claim({ id: "c-uncited", text: "Acme raised a $5M seed round.", category: "funding", provenance: "PUBLIC_RESEARCH" }),
    claim({ id: "c-inferred", text: "Acme is likely valued above $30M.", category: "valuation", provenance: "AI_INFERENCE" }),
    claim({ id: "c-user", text: "Founder said they have 12 employees.", category: "team", provenance: "USER_PROVIDED" }),
  ];

  it("places cited public claims in research and keeps uncited or inferred ones out of the facts", () => {
    const brief = assembleMeetingBrief(emptyBundle({ claims }));

    expect(brief.facts.research.map((item) => item.record.id)).toEqual(["c-public", "c-user"]);
    expect(brief.unverified.map((item) => item.record.id)).toEqual(["c-uncited"]);
    expect(brief.inferences.map((item) => item.record.id)).toEqual(["c-inferred"]);
    expect(brief.facts.research.find((item) => item.record.id === "c-public")).toMatchObject({ evidenceClass: "PUBLIC_SOURCE", sourceIds: ["s1"] });
  });

  it("establishes sensitive facts only from supported evidence", () => {
    const facts = Object.fromEntries(assembleMeetingBrief(emptyBundle({ claims })).facts.keyFacts.map((fact) => [fact.key, fact.status]));

    expect(facts.revenue).toBe("ESTABLISHED");
    expect(facts.funding).toBe("UNVERIFIED");
    expect(facts.valuation).toBe("UNVERIFIED");
    expect(facts.employees).toBe("ESTABLISHED");
    expect(facts.customers).toBe("UNAVAILABLE");
  });

  it("keeps the source appendix limited to cited sources with stable numbering", () => {
    const brief = assembleMeetingBrief(
      emptyBundle({
        claims: [
          ...claims,
          claim({ id: "c-two", text: "Acme operates in logistics.", category: "overview", provenance: "PUBLIC_RESEARCH", sources: [{ id: "s2", url: "https://b.example.com" }, { id: "s1", url: "https://news.example.com/acme" }] }),
        ],
      }),
    );

    expect(brief.sources.map((source) => source.id)).toEqual(["s2", "s1"]);
    expect(brief.facts.companyOverview.map((item) => item.record.id)).toEqual(["c-two"]);
  });

  it("drops unsafe URLs from sources and connected-account links", () => {
    const brief = assembleMeetingBrief(
      emptyBundle({
        claims: [claim({ id: "c-xss", text: "Acme product launch.", category: "product", provenance: "PUBLIC_RESEARCH", sources: [{ id: "bad", url: "javascript:alert(1)" }] })],
        emails: [{ id: "t1", subject: "Intro", snippet: null, lastMessageAt: daysAgo(4), messageCount: 2, hasUserReply: true, threadUrl: "javascript:alert(2)", contactId: null }],
      }),
    );

    expect(brief.sources[0]?.url).toBeNull();
    expect(brief.facts.relationshipHistory.emails[0]?.record.href).toBeNull();
  });

  it("marks company fields as user-provided, not public research", () => {
    const bundle = emptyBundle();
    const brief = assembleMeetingBrief({ ...bundle, company: { ...bundle.company, sector: "Robotics", website: "https://acme.example" } });

    expect(brief.facts.companyOverview.map((item) => [item.text, item.evidenceClass])).toEqual([
      ["Sector: Robotics", "USER_PROVIDED"],
      ["Website: https://acme.example", "USER_PROVIDED"],
    ]);
  });

  it("maps every ClaimProvenance value to an evidence class", () => {
    expect(classifyClaim("PUBLIC_RESEARCH", 1)).toBe("PUBLIC_SOURCE");
    expect(classifyClaim("PUBLIC_RESEARCH", 0)).toBe("UNVERIFIED");
    expect(classifyClaim("CONNECTED_ACCOUNT", 0)).toBe("CONNECTED_ACCOUNT");
    expect(classifyClaim("USER_PROVIDED", 0)).toBe("USER_PROVIDED");
    expect(classifyClaim("AI_INFERENCE", 3)).toBe("AI_INFERENCE");
    expect(classifyClaim("UNVERIFIED", 3)).toBe("UNVERIFIED");
  });
});

describe("meeting brief relationship context", () => {
  it("splits past and upcoming meetings at the generation time", () => {
    const meeting = (id: string, offsetDays: number) => ({
      id,
      title: id,
      startsAt: new Date(NOW.getTime() + offsetDays * DAY),
      endsAt: new Date(NOW.getTime() + offsetDays * DAY + 3_600_000),
      attendees: ["a@example.com"],
      htmlLink: null,
      contactId: "p1",
    });
    const brief = assembleMeetingBrief(emptyBundle({ meetings: [meeting("past", -10), meeting("next", 2), meeting("later", 9)] }));

    expect(brief.facts.relationshipHistory.pastMeetings.map((item) => item.record.id)).toEqual(["past"]);
    expect(brief.facts.relationshipHistory.upcomingMeetings.map((item) => item.record.id)).toEqual(["next", "later"]);
  });

  it("only lists recorded introducers as warm introductions", () => {
    const brief = assembleMeetingBrief(
      emptyBundle({
        people: [person({ id: "p1", name: "Founder", role: "FOUNDER" }), person({ id: "p2", name: "Angel", role: "INTRODUCER" })],
        edges: [{ id: "e1", toNodeId: "p2", relationship: "Email communication", source: "Gmail", strength: 6, evidence: "A Gmail message exists." }],
      }),
    );

    expect(brief.facts.warmIntroductions).toHaveLength(1);
    expect(brief.facts.warmIntroductions[0]).toMatchObject({ contactId: "p2", basis: "INTRODUCER_ROLE" });
    expect(brief.facts.warmIntroductions[0]?.relationshipEvidence[0]).toMatchObject({ evidenceClass: "CONNECTED_ACCOUNT", record: { type: "relationship_edge" } });
  });

  it("flags cooling relationships and stale research as generated concerns", () => {
    const brief = assembleMeetingBrief(
      emptyBundle({
        people: [
          person({
            id: "p1",
            name: "Founder",
            role: "FOUNDER",
            interactions: [
              { type: "EMAIL_SENT", daysAgo: 80 },
              { type: "EMAIL_RECEIVED", daysAgo: 85 },
            ],
          }),
        ],
        claims: [claim({ id: "c1", text: "Acme builds robots.", category: "overview", provenance: "PUBLIC_RESEARCH", sources: [{ id: "s1", url: "https://a.example", accessedDaysAgo: 400 }] })],
      }),
    );

    const texts = brief.generated.concerns.map((concern) => concern.text);
    expect(texts).toContain("Every assessed relationship on this opportunity is cooling or dormant.");
    expect(texts).toContain("Stored research may be stale.");
  });

  it("names the brief after the target meeting when one is selected", () => {
    const target = { id: "m1", title: "Partner meeting", startsAt: new Date("2026-09-03T15:00:00.000Z"), endsAt: NOW, attendees: [], htmlLink: null, contactId: null };
    expect(briefTitle(emptyBundle({ targetMeeting: target }))).toBe("Acme Robotics: Partner meeting (2026-09-03)");
    expect(briefTitle(emptyBundle())).toBe("Acme Robotics: meeting brief");
  });
});

describe("safeExternalUrl", () => {
  it("allows only absolute http(s) URLs", () => {
    expect(safeExternalUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeExternalUrl("http://example.com")).toBe("http://example.com/");
    for (const unsafe of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "/relative", "", null, "not a url"]) {
      expect(safeExternalUrl(unsafe)).toBeNull();
    }
  });
});
