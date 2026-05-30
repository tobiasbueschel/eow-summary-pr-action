import * as core from "@actions/core";
import * as github from "@actions/github";
import { readConfig } from "./config.js";
import { GitHubClient } from "./github-client.js";
import { generateSummary } from "./openai.js";
import { buildSummaryPrompt } from "./prompt.js";
import { renderPullRequestBody, renderSummaryFile, resolveSummaryWindow } from "./summary.js";
import type { SummaryMarker } from "./types.js";

export async function run(): Promise<void> {
  const config = readConfig();
  const octokit = github.getOctokit(config.githubToken);
  const githubClient = new GitHubClient(octokit, config.owner, config.repo);
  const repository = `${config.owner}/${config.repo}`;
  const baseBranch = config.baseBranch ?? (await githubClient.getDefaultBranch());

  if (baseBranch === config.prBranch) {
    throw new Error("Resolved base_branch and pr_branch must be different.");
  }

  core.info(`Generating end-of-week summary for ${repository} on ${baseBranch}.`);

  const existingSummary = await githubClient.getTextFile(config.summaryPath, baseBranch);
  const window = resolveSummaryWindow(existingSummary, config.now, config.lookbackFallbackDays);
  core.info(`Summary window: ${window.start.toISOString()} to ${window.end.toISOString()} (${window.source}).`);

  const activity = await githubClient.collectActivity(baseBranch, window.start, window.end, config.prBranch);
  core.info(
    `Activity checked: ${activity.commits.length} commits, ${activity.pullRequests.length} pull requests, ${activity.releases.length} releases.`
  );

  const prompt = buildSummaryPrompt({
    repository,
    baseBranch,
    window,
    activity,
    maxPromptChars: config.maxPromptChars
  });

  const generatedSummary = await generateSummary({
    apiKey: config.openaiApiKey,
    model: config.model,
    systemPrompt: config.systemPrompt,
    prompt: prompt.prompt,
    timeoutMs: config.openaiTimeoutMs
  });

  const marker: SummaryMarker = {
    version: 1,
    summary_start: window.start.toISOString(),
    summary_end: window.end.toISOString(),
    generated_at: config.now.toISOString(),
    base_branch: baseBranch,
    model: config.model
  };
  const summaryContent = renderSummaryFile({
    generatedSummary,
    marker,
    activity,
    repository,
    windowSource: window.source,
    truncated: prompt.truncated
  });
  const prBody = renderPullRequestBody({
    summaryPath: config.summaryPath,
    baseBranch,
    prBranch: config.prBranch,
    model: config.model,
    window,
    activity,
    truncated: prompt.truncated,
    generatedSummary
  });
  const pullRequest = await githubClient.createOrUpdateSummaryPullRequest({
    baseBranch,
    prBranch: config.prBranch,
    summaryPath: config.summaryPath,
    summaryContent,
    commitMessage: `Update end-of-week summary (${window.end.toISOString().slice(0, 10)})`,
    prTitle: config.prTitle,
    prBody
  });

  core.setOutput("pull_request_url", pullRequest.url);
  core.setOutput("pull_request_number", String(pullRequest.number));
  core.setOutput("summary_start", window.start.toISOString());
  core.setOutput("summary_end", window.end.toISOString());
  core.setOutput("changed", "true");

  core.info(`${pullRequest.created ? "Created" : "Updated"} pull request #${pullRequest.number}: ${pullRequest.url}`);
}
