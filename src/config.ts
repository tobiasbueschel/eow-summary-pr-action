import * as core from "@actions/core";
import * as github from "@actions/github";
import { DEFAULT_SYSTEM_PROMPT } from "./defaults.js";
import type { ActionConfig } from "./types.js";

export function readConfig(): ActionConfig {
  const { owner, repo } = github.context.repo;
  const baseBranch = optionalInput("base_branch");
  const summaryPath = requiredInput("summary_path");
  const prBranch = requiredInput("pr_branch");
  const prTitle = requiredInput("pr_title");
  const model = requiredInput("model");
  const githubToken = requiredInput("github_token");
  const openaiApiKey = requiredEnv("OPENAI_API_KEY");
  const systemPrompt = optionalEnv("EOW_SYSTEM_PROMPT") ?? DEFAULT_SYSTEM_PROMPT;
  const lookbackFallbackDays = positiveIntegerInput("lookback_fallback_days", 7);
  const maxPromptChars = positiveIntegerInput("max_prompt_chars", 120000);
  const openaiTimeoutMs = positiveIntegerInput("openai_timeout_ms", 60000);

  validateRepoPath(summaryPath, "summary_path");
  validateBranchName(prBranch, "pr_branch");
  if (baseBranch) {
    validateBranchName(baseBranch, "base_branch");
  }

  if (baseBranch && baseBranch === prBranch) {
    throw new Error("base_branch and pr_branch must be different.");
  }

  if (maxPromptChars < 10000) {
    throw new Error("max_prompt_chars must be at least 10000.");
  }

  if (openaiTimeoutMs < 1000) {
    throw new Error("openai_timeout_ms must be at least 1000.");
  }

  return {
    owner,
    repo,
    baseBranch,
    summaryPath,
    prBranch,
    prTitle,
    model,
    lookbackFallbackDays,
    maxPromptChars,
    openaiTimeoutMs,
    githubToken,
    openaiApiKey,
    systemPrompt,
    now: new Date()
  };
}

function requiredInput(name: string): string {
  const value = core.getInput(name, { required: true }).trim();
  if (!value) {
    throw new Error(`Input ${name} is required.`);
  }
  return value;
}

function optionalInput(name: string): string | undefined {
  const value = core.getInput(name).trim();
  return value || undefined;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required.`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function positiveIntegerInput(name: string, defaultValue: number): number {
  const rawValue = core.getInput(name).trim();
  const value = rawValue ? Number.parseInt(rawValue, 10) : defaultValue;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Input ${name} must be a positive integer.`);
  }
  return value;
}

function validateRepoPath(path: string, inputName: string): void {
  if (path.startsWith("/") || path.includes("\\")) {
    throw new Error(`${inputName} must be a repository-relative POSIX path.`);
  }

  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${inputName} must not contain empty, current-directory, or parent-directory segments.`);
  }
}

function validateBranchName(branch: string, inputName: string): void {
  if (branch.startsWith("refs/") || branch.startsWith("/") || branch.endsWith("/")) {
    throw new Error(`${inputName} must be a plain branch name, not a ref.`);
  }

  if (branch.includes("..") || branch.includes("\\") || branch.includes(" ") || branch.includes("~")) {
    throw new Error(`${inputName} contains characters that are not supported by this action.`);
  }
}
