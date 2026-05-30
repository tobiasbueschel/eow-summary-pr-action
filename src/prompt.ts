import type { PromptPayloadResult, RepositoryActivity, SummaryWindow } from "./types.js";

interface PromptPayload {
  repository: string;
  base_branch: string;
  summary_window: {
    start: string;
    end: string;
    source: SummaryWindow["source"];
  };
  total_counts: {
    commits: number;
    pull_requests: number;
    releases: number;
  };
  included_counts: {
    commits: number;
    pull_requests: number;
    releases: number;
  };
  truncated: boolean;
  commits: RepositoryActivity["commits"];
  pull_requests: RepositoryActivity["pullRequests"];
  releases: RepositoryActivity["releases"];
}

export function buildSummaryPrompt(input: {
  repository: string;
  baseBranch: string;
  window: SummaryWindow;
  activity: RepositoryActivity;
  maxPromptChars: number;
}): PromptPayloadResult {
  const totalCounts = {
    commits: input.activity.commits.length,
    pull_requests: input.activity.pullRequests.length,
    releases: input.activity.releases.length
  };

  let commitLimit = input.activity.commits.length;
  let pullRequestLimit = input.activity.pullRequests.length;
  let releaseLimit = input.activity.releases.length;
  let payload = makePayload(input, totalCounts, commitLimit, pullRequestLimit, releaseLimit, false);
  let prompt = renderPrompt(payload);

  while (prompt.length > input.maxPromptChars && (commitLimit > 10 || pullRequestLimit > 10 || releaseLimit > 10)) {
    commitLimit = nextLimit(commitLimit);
    pullRequestLimit = nextLimit(pullRequestLimit);
    releaseLimit = nextLimit(releaseLimit);
    payload = makePayload(input, totalCounts, commitLimit, pullRequestLimit, releaseLimit, true);
    prompt = renderPrompt(payload);
  }

  if (prompt.length > input.maxPromptChars) {
    payload = makePayload(input, totalCounts, commitLimit, pullRequestLimit, releaseLimit, true, true);
    prompt = renderPrompt(payload);
  }

  return {
    prompt,
    truncated: payload.truncated,
    includedCounts: {
      commits: payload.included_counts.commits,
      pullRequests: payload.included_counts.pull_requests,
      releases: payload.included_counts.releases
    }
  };
}

function makePayload(
  input: {
    repository: string;
    baseBranch: string;
    window: SummaryWindow;
    activity: RepositoryActivity;
  },
  totalCounts: PromptPayload["total_counts"],
  commitLimit: number,
  pullRequestLimit: number,
  releaseLimit: number,
  truncated: boolean,
  compactText = false
): PromptPayload {
  const commits = input.activity.commits.slice(0, commitLimit).map((commit) => ({
    ...commit,
    message: compactText ? limitText(commit.message, 240) : commit.message
  }));
  const pullRequests = input.activity.pullRequests.slice(0, pullRequestLimit).map((pullRequest) => ({
    ...pullRequest,
    title: compactText ? limitText(pullRequest.title, 180) : pullRequest.title
  }));
  const releases = input.activity.releases.slice(0, releaseLimit).map((release) => ({
    ...release,
    name: release.name ? (compactText ? limitText(release.name, 180) : release.name) : undefined
  }));

  return {
    repository: input.repository,
    base_branch: input.baseBranch,
    summary_window: {
      start: input.window.start.toISOString(),
      end: input.window.end.toISOString(),
      source: input.window.source
    },
    total_counts: totalCounts,
    included_counts: {
      commits: commits.length,
      pull_requests: pullRequests.length,
      releases: releases.length
    },
    truncated,
    commits,
    pull_requests: pullRequests,
    releases
  };
}

function renderPrompt(payload: PromptPayload): string {
  return [
    "Create an end-of-week Markdown summary for this repository activity.",
    "",
    "Requirements:",
    "- Start with a short overview paragraph.",
    "- Include sections for merged pull requests, releases, notable commits, and follow-ups when applicable.",
    "- If there is no qualifying activity, say that clearly.",
    "- Mention when the activity payload was truncated.",
    "- Do not treat previous end-of-week summary maintenance as product or engineering progress.",
    "- Do not include the hidden metadata marker; the action adds it separately.",
    "",
    "Repository activity JSON:",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}

function nextLimit(current: number): number {
  if (current <= 10) {
    return current;
  }

  return Math.max(10, Math.floor(current * 0.75));
}

function limitText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit).trimEnd()}...`;
}
