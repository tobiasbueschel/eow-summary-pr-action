export interface ActionConfig {
  owner: string;
  repo: string;
  baseBranch?: string;
  summaryPath: string;
  prBranch: string;
  prTitle: string;
  model: string;
  lookbackFallbackDays: number;
  maxPromptChars: number;
  openaiTimeoutMs: number;
  githubToken: string;
  openaiApiKey: string;
  systemPrompt: string;
  now: Date;
}

export interface SummaryWindow {
  start: Date;
  end: Date;
  source: "marker" | "fallback";
}

export interface SummaryMarker {
  version: 1;
  summary_start: string;
  summary_end: string;
  generated_at: string;
  base_branch: string;
  model: string;
}

export interface CommitActivity {
  sha: string;
  shortSha: string;
  message: string;
  authorName?: string;
  authorLogin?: string;
  committedAt?: string;
  url?: string;
}

export interface PullRequestActivity {
  number: number;
  title: string;
  state: string;
  merged: boolean;
  authorLogin?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  mergedAt?: string;
  url?: string;
  labels: string[];
}

export interface ReleaseActivity {
  tagName: string;
  name?: string;
  draft: boolean;
  prerelease: boolean;
  authorLogin?: string;
  createdAt?: string;
  publishedAt?: string;
  url?: string;
}

export interface RepositoryActivity {
  commits: CommitActivity[];
  pullRequests: PullRequestActivity[];
  releases: ReleaseActivity[];
}

export interface PromptPayloadResult {
  prompt: string;
  truncated: boolean;
  includedCounts: {
    commits: number;
    pullRequests: number;
    releases: number;
  };
}

export interface PullRequestResult {
  number: number;
  url: string;
  created: boolean;
}
