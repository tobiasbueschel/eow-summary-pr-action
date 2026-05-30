import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSummaryPrompt } from "../src/prompt.js";
import type { RepositoryActivity, SummaryWindow } from "../src/types.js";

describe("buildSummaryPrompt", () => {
  it("includes repository activity as JSON", () => {
    const window = makeWindow();
    const activity: RepositoryActivity = {
      commits: [
        {
          sha: "abc1234",
          shortSha: "abc1234",
          message: "Add a report",
          authorLogin: "mona"
        }
      ],
      pullRequests: [
        {
          number: 42,
          title: "Improve weekly report",
          state: "closed",
          merged: true,
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-11T00:00:00.000Z",
          mergedAt: "2026-05-11T00:00:00.000Z",
          labels: ["enhancement"]
        }
      ],
      releases: []
    };

    const result = buildSummaryPrompt({
      repository: "octo/repo",
      baseBranch: "main",
      window,
      activity,
      maxPromptChars: 120000
    });

    assert.equal(result.truncated, false);
    assert.match(result.prompt, /"repository": "octo\/repo"/);
    assert.match(result.prompt, /"pull_requests"/);
    assert.deepEqual(result.includedCounts, {
      commits: 1,
      pullRequests: 1,
      releases: 0
    });
  });

  it("truncates large payloads before sending them to OpenAI", () => {
    const commits = Array.from({ length: 80 }, (_, index) => ({
      sha: `abcdef${index}`,
      shortSha: `abc${index}`,
      message: `Commit ${index} ${"x".repeat(500)}`
    }));
    const activity: RepositoryActivity = {
      commits,
      pullRequests: [],
      releases: []
    };

    const result = buildSummaryPrompt({
      repository: "octo/repo",
      baseBranch: "main",
      window: makeWindow(),
      activity,
      maxPromptChars: 10000
    });

    assert.equal(result.truncated, true);
    assert.equal(result.includedCounts.commits < commits.length, true);
    assert.match(result.prompt, /"truncated": true/);
  });
});

function makeWindow(): SummaryWindow {
  return {
    start: new Date("2026-05-08T18:00:00.000Z"),
    end: new Date("2026-05-15T18:00:00.000Z"),
    source: "marker"
  };
}
