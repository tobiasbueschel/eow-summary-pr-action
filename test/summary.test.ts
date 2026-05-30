import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSummaryMarker, renderSummaryFile, resolveSummaryWindow } from "../src/summary.js";
import type { RepositoryActivity, SummaryMarker } from "../src/types.js";

describe("summary markers", () => {
  it("parses a valid summary marker", () => {
    const content = [
      "# End of Week Summary",
      '<!-- eow-summary: {"version":1,"summary_start":"2026-05-01T00:00:00.000Z","summary_end":"2026-05-08T00:00:00.000Z","generated_at":"2026-05-08T00:00:00.000Z","base_branch":"main","model":"gpt-5.4-mini"} -->'
    ].join("\n");

    assert.deepEqual(parseSummaryMarker(content), {
      version: 1,
      summary_start: "2026-05-01T00:00:00.000Z",
      summary_end: "2026-05-08T00:00:00.000Z",
      generated_at: "2026-05-08T00:00:00.000Z",
      base_branch: "main",
      model: "gpt-5.4-mini"
    });
  });

  it("ignores missing and malformed markers", () => {
    assert.equal(parseSummaryMarker("# No marker"), undefined);
    assert.equal(parseSummaryMarker("<!-- eow-summary: nope -->"), undefined);
    assert.equal(parseSummaryMarker('<!-- eow-summary: {"version":1,"summary_end":"not-a-date"} -->'), undefined);
  });

  it("uses marker summary_end as the next window start", () => {
    const now = new Date("2026-05-15T18:00:00.000Z");
    const content =
      '<!-- eow-summary: {"version":1,"summary_start":"2026-05-01T00:00:00.000Z","summary_end":"2026-05-08T18:00:00.000Z","generated_at":"2026-05-08T18:00:00.000Z","base_branch":"main","model":"gpt-5.4-mini"} -->';

    assert.deepEqual(resolveSummaryWindow(content, now, 7), {
      start: new Date("2026-05-08T18:00:00.000Z"),
      end: now,
      source: "marker"
    });
  });

  it("falls back to configured lookback days without a marker", () => {
    const now = new Date("2026-05-15T18:00:00.000Z");
    const window = resolveSummaryWindow(undefined, now, 7);

    assert.equal(window.source, "fallback");
    assert.equal(window.start.toISOString(), "2026-05-08T18:00:00.000Z");
    assert.equal(window.end, now);
  });

  it("renders a complete rolling summary file with activity counts", () => {
    const activity: RepositoryActivity = {
      commits: [
        {
          sha: "abc1234",
          shortSha: "abc1234",
          message: "Ship feature"
        }
      ],
      pullRequests: [],
      releases: []
    };
    const marker: SummaryMarker = {
      version: 1,
      summary_start: "2026-05-08T18:00:00.000Z",
      summary_end: "2026-05-15T18:00:00.000Z",
      generated_at: "2026-05-15T18:00:00.000Z",
      base_branch: "main",
      model: "gpt-5.4-mini"
    };

    const rendered = renderSummaryFile({
      generatedSummary: "Work shipped.",
      marker,
      activity,
      repository: "octo/repo",
      windowSource: "marker",
      truncated: false
    });

    assert.match(rendered, /# End of Week Summary/);
    assert.match(rendered, /Work shipped\./);
    assert.match(rendered, /- Commits: 1/);
    assert.match(rendered, /<!-- eow-summary:/);
  });
});
