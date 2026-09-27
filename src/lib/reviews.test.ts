import { describe, expect, it } from "vitest";
import { hasReviewLink, reviewNeedsYouItems, reviewStage, reviewSummary, type ReviewRequestLike, type ReviewSettingsLike } from "./reviews";
import { DEFAULT_TEMPLATES, fillTemplate, reviewLink, reviewVars } from "./messageTemplates";

const NOW = new Date("2026-10-20T12:00:00Z");
const S: ReviewSettingsLike = { enabled: true, google_url: "https://g.page/r/abc/review", other_sites: [], reminder_days: 5 };
const rr = (over: Partial<ReviewRequestLike> = {}): ReviewRequestLike => ({
  status: "not_asked",
  eligible_at: null,
  asked_at: null,
  reminded_at: null,
  first_clicked_at: null,
  left_at: null,
  ...over,
});
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("reviewStage", () => {
  it("off without the feature or a link", () => {
    expect(reviewStage(rr({ eligible_at: daysAgo(1) }), { ...S, enabled: false }, false, NOW)).toBe("off");
    expect(reviewStage(rr({ eligible_at: daysAgo(1) }), { ...S, google_url: "" }, false, NOW)).toBe("off");
    expect(hasReviewLink({ google_url: null, other_sites: [{ site: "yelp", url: "https://yelp.com/x" }] })).toBe(true);
  });
  it("waiting → ask once eligible", () => {
    expect(reviewStage(rr(), S, false, NOW)).toBe("waiting");
    expect(reviewStage(rr({ eligible_at: daysAgo(0) }), S, false, NOW)).toBe("ask");
  });
  it("asked → remind after X days → reminded (one reminder only)", () => {
    expect(reviewStage(rr({ status: "asked", asked_at: daysAgo(4) }), S, false, NOW)).toBe("asked");
    expect(reviewStage(rr({ status: "asked", asked_at: daysAgo(5) }), S, false, NOW)).toBe("remind");
    expect(reviewStage(rr({ status: "asked", asked_at: daysAgo(9), reminded_at: daysAgo(2) }), S, false, NOW)).toBe("reminded");
  });
  it("clicked / left win; opted-out clients aren't prompted", () => {
    expect(reviewStage(rr({ status: "clicked", asked_at: daysAgo(9) }), S, false, NOW)).toBe("clicked");
    expect(reviewStage(rr({ status: "left" }), S, true, NOW)).toBe("left");
    expect(reviewStage(rr({ eligible_at: daysAgo(1) }), S, true, NOW)).toBe("opted_out");
    expect(reviewStage(rr({ status: "dismissed", eligible_at: daysAgo(1) }), S, false, NOW)).toBe("dismissed");
  });
});

describe("Needs you items", () => {
  const base = { project_id: "p1", projectName: "Greg Patio", clientName: "Greg Gray", clientOptedOut: false };
  it("ask and remind items link to the project's request sheet", () => {
    const items = reviewNeedsYouItems(
      [
        { ...base, ...rr({ eligible_at: daysAgo(2) }) },
        { ...base, project_id: "p2", ...rr({ status: "asked", asked_at: daysAgo(6) }) },
        { ...base, project_id: "p3", ...rr({ status: "asked", asked_at: daysAgo(1) }) },
        { ...base, project_id: "p4", clientOptedOut: true, ...rr({ eligible_at: daysAgo(2) }) },
      ],
      S,
      NOW,
    );
    expect(items.map((i) => [i.title, i.href])).toEqual([
      ["Ask Greg Gray for a review", "/projects/p1?review=ask"],
      ["Remind Greg about the review", "/projects/p2?review=remind"],
    ]);
  });
});

describe("reviewSummary", () => {
  it("counts sent / clicked / left in the window, with a click rate", () => {
    const rows = [
      rr({ status: "clicked", asked_at: daysAgo(3), first_clicked_at: daysAgo(2) }),
      rr({ status: "left", asked_at: daysAgo(10), first_clicked_at: daysAgo(9), left_at: daysAgo(8) }),
      rr({ status: "asked", asked_at: daysAgo(20) }),
      rr({ status: "asked", asked_at: daysAgo(60) }),
      rr({ status: "not_asked" }),
    ];
    expect(reviewSummary(rows, 30, NOW)).toEqual({ sent: 3, clicked: 2, left: 1, clickRate: 67 });
    expect(reviewSummary(rows, 90, NOW)).toEqual({ sent: 4, clicked: 2, left: 1, clickRate: 50 });
    expect(reviewSummary([], 30, NOW).clickRate).toBeNull();
  });
});

describe("review message", () => {
  it("fills the default review request with the tracked link", () => {
    const link = reviewLink("tok-123", "https://app.test");
    const vars = reviewVars({ clientName: "Greg Gray", companyName: "Stone & Co", projectName: "Greg Patio", reviewLink: link, hubLink: "x" });
    expect(fillTemplate(DEFAULT_TEMPLATES.review_request.body, vars)).toBe(
      "Hi Greg, thanks again for choosing Stone & Co for your Greg Patio! If you're happy with how it turned out, a quick Google review would mean a lot to us: https://app.test/r/tok-123",
    );
  });
});
