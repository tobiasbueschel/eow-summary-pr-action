# End of Week Summary PR

Create a weekly pull request with an AI-generated end-of-week summary for a repository. The action reads commits, pull requests, and releases from GitHub, sends the normalized activity to OpenAI, updates a rolling Markdown summary file, and opens or updates a pull request against the target branch.

This repository is structured for GitHub Marketplace publication: it contains one root `action.yml`, the action code, and the bundled `dist/index.js`. It intentionally does not contain `.github/workflows` files.

## Usage

```yaml
name: End of week summary

on:
  schedule:
    # GitHub schedules use UTC. This example runs at 18:00 UTC every Friday.
    - cron: "0 18 * * 5"
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  summarize:
    runs-on: ubuntu-latest
    steps:
      - uses: tobiasbueschel/eow-summary-pr-action@v1
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          EOW_SYSTEM_PROMPT: ${{ vars.EOW_SYSTEM_PROMPT }}
        with:
          base_branch: main
```

Scheduled workflows run in UTC from the latest commit on the repository default branch. The `base_branch` input controls which branch the action summarizes and targets with the pull request; it does not change which branch GitHub uses to load the workflow file.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `base_branch` | repository default branch | Branch to summarize and target with the pull request. |
| `summary_path` | `EOW_SUMMARY.md` | Rolling Markdown summary file path. |
| `pr_branch` | `eow-summary/update` | Action-owned branch used for the generated pull request. This branch is force-updated. |
| `pr_title` | `End of week summary` | Pull request title. |
| `model` | `gpt-5.4-mini` | OpenAI model used for the summary. |
| `lookback_fallback_days` | `7` | Window length when no previous summary marker exists. |
| `max_prompt_chars` | `120000` | Maximum activity payload characters sent to OpenAI after all activity is collected. |
| `openai_timeout_ms` | `60000` | OpenAI request timeout in milliseconds. |
| `github_token` | `${{ github.token }}` | Token used to read repository activity and create the PR. |

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | OpenAI API key used for the Responses API request. |
| `EOW_SYSTEM_PROMPT` | No | Overrides the built-in summary-writing instructions. |

## Outputs

| Output | Description |
| --- | --- |
| `pull_request_url` | URL of the created or updated pull request. |
| `pull_request_number` | Number of the created or updated pull request. |
| `summary_start` | ISO timestamp for the beginning of the summarized window. |
| `summary_end` | ISO timestamp for the end of the summarized window. |
| `changed` | Always `true` when the summary branch was updated. |

## Behavior

The first run summarizes the previous `lookback_fallback_days`. Later runs read a hidden marker in `summary_path` and summarize activity since the previous `summary_end`.

Every run writes a fresh summary file and opens or updates a pull request, including runs with no qualifying activity. No-activity weeks still update the marker so the next run starts from the correct timestamp.

The action gathers repository activity through the GitHub API and does not require `actions/checkout`.

## Marketplace Release Notes

Before publishing:

1. Push the repository publicly.
2. Confirm `action.yml` has a Marketplace-unique `name`.
3. Build and commit `dist/index.js`.
4. Tag and publish a release, then select "Publish this Action to the GitHub Marketplace".
