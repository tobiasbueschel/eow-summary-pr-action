import { MARKER_NAME } from "./defaults.js";
import type { RepositoryActivity, SummaryMarker, SummaryWindow } from "./types.js";

const markerPattern = new RegExp(`<!--\\s*${MARKER_NAME}:\\s*(\\{[\\s\\S]*?\\})\\s*-->`);

export function parseSummaryMarker(content: string | undefined): SummaryMarker | undefined {
  if (!content) {
    return undefined;
  }

  const match = markerPattern.exec(content);
  if (!match?.[1]) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(match[1]) as Partial<SummaryMarker>;
    const summaryEnd = parsed.summary_end;
    if (parsed.version !== 1 || typeof summaryEnd !== "string" || !isValidDate(summaryEnd)) {
      return undefined;
    }

    return {
      version: 1,
      summary_start: stringOrEmpty(parsed.summary_start),
      summary_end: summaryEnd,
      generated_at: stringOrEmpty(parsed.generated_at),
      base_branch: stringOrEmpty(parsed.base_branch),
      model: stringOrEmpty(parsed.model)
    };
  } catch {
    return undefined;
  }
}

export function resolveSummaryWindow(
  existingContent: string | undefined,
  now: Date,
  fallbackDays: number
): SummaryWindow {
  const marker = parseSummaryMarker(existingContent);
  if (marker) {
    return {
      start: new Date(marker.summary_end),
      end: now,
      source: "marker"
    };
  }

  const fallbackStart = new Date(now.getTime() - fallbackDays * 24 * 60 * 60 * 1000);
  return {
    start: fallbackStart,
    end: now,
    source: "fallback"
  };
}

export function renderSummaryFile(input: {
  generatedSummary: string;
  marker: SummaryMarker;
  activity: RepositoryActivity;
  repository: string;
  windowSource: SummaryWindow["source"];
  truncated: boolean;
}): string {
  const counts = activityCounts(input.activity);
  const summary = input.generatedSummary.trim() || "No summary was generated.";
  const marker = JSON.stringify(input.marker);

  return [
    "# End of Week Summary",
    "",
    `Repository: \`${input.repository}\``,
    `Base branch: \`${input.marker.base_branch}\``,
    `Window: \`${input.marker.summary_start}\` to \`${input.marker.summary_end}\``,
    `Window source: \`${input.windowSource}\``,
    `Model: \`${input.marker.model}\``,
    "",
    "## Summary",
    "",
    summary,
    "",
    "## Activity Checked",
    "",
    `- Commits: ${counts.commits}`,
    `- Pull requests: ${counts.pullRequests}`,
    `- Releases: ${counts.releases}`,
    `- Prompt payload truncated: ${input.truncated ? "yes" : "no"}`,
    "",
    `<!-- ${MARKER_NAME}: ${marker} -->`,
    ""
  ].join("\n");
}

export function renderPullRequestBody(input: {
  summaryPath: string;
  baseBranch: string;
  prBranch: string;
  model: string;
  window: SummaryWindow;
  activity: RepositoryActivity;
  truncated: boolean;
  generatedSummary: string;
}): string {
  const counts = activityCounts(input.activity);
  const summary = truncateForPullRequest(input.generatedSummary.trim());

  return [
    "Automated end-of-week summary update.",
    "",
    `- Summary file: \`${input.summaryPath}\``,
    `- Base branch: \`${input.baseBranch}\``,
    `- Update branch: \`${input.prBranch}\``,
    `- Window: \`${input.window.start.toISOString()}\` to \`${input.window.end.toISOString()}\``,
    `- Window source: \`${input.window.source}\``,
    `- Model: \`${input.model}\``,
    `- Activity checked: ${counts.commits} commits, ${counts.pullRequests} pull requests, ${counts.releases} releases`,
    `- Prompt payload truncated: ${input.truncated ? "yes" : "no"}`,
    "",
    "## Generated Summary",
    "",
    summary || "No summary was generated."
  ].join("\n");
}

export function activityCounts(activity: RepositoryActivity): {
  commits: number;
  pullRequests: number;
  releases: number;
} {
  return {
    commits: activity.commits.length,
    pullRequests: activity.pullRequests.length,
    releases: activity.releases.length
  };
}

function truncateForPullRequest(summary: string): string {
  const limit = 5000;
  if (summary.length <= limit) {
    return summary;
  }

  return `${summary.slice(0, limit).trimEnd()}\n\n_Trimmed in PR body. See the summary file for the complete text._`;
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}
