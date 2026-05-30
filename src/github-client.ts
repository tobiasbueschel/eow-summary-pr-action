import * as github from "@actions/github";
import type {
  CommitActivity,
  PullRequestActivity,
  PullRequestResult,
  ReleaseActivity,
  RepositoryActivity
} from "./types.js";

type Octokit = ReturnType<typeof github.getOctokit>;

export class GitHubClient {
  constructor(
    private readonly octokit: Octokit,
    private readonly owner: string,
    private readonly repo: string
  ) {}

  async getDefaultBranch(): Promise<string> {
    const response = await this.octokit.rest.repos.get({
      owner: this.owner,
      repo: this.repo
    });
    return response.data.default_branch;
  }

  async getTextFile(path: string, ref: string): Promise<string | undefined> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref
      });

      const data = response.data;
      if (Array.isArray(data) || data.type !== "file") {
        throw new Error(`${path} exists at ${ref}, but it is not a file.`);
      }

      if (!("content" in data) || typeof data.content !== "string") {
        return undefined;
      }

      return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
    } catch (error) {
      if (isHttpStatus(error, 404)) {
        return undefined;
      }
      throw error;
    }
  }

  async collectActivity(baseBranch: string, since: Date, until: Date, excludedHeadBranch?: string): Promise<RepositoryActivity> {
    const [commits, pullRequests, releases] = await Promise.all([
      this.collectCommits(baseBranch, since, until),
      this.collectPullRequests(baseBranch, since, until, excludedHeadBranch),
      this.collectReleases(since, until)
    ]);

    return {
      commits,
      pullRequests,
      releases
    };
  }

  async createOrUpdateSummaryPullRequest(input: {
    baseBranch: string;
    prBranch: string;
    summaryPath: string;
    summaryContent: string;
    commitMessage: string;
    prTitle: string;
    prBody: string;
  }): Promise<PullRequestResult> {
    const baseRef = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${input.baseBranch}`
    });
    const baseSha = baseRef.data.object.sha;
    const baseCommit = await this.octokit.rest.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: baseSha
    });
    const blob = await this.octokit.rest.git.createBlob({
      owner: this.owner,
      repo: this.repo,
      content: input.summaryContent,
      encoding: "utf-8"
    });
    const tree = await this.octokit.rest.git.createTree({
      owner: this.owner,
      repo: this.repo,
      base_tree: baseCommit.data.tree.sha,
      tree: [
        {
          path: input.summaryPath,
          mode: "100644",
          type: "blob",
          sha: blob.data.sha
        }
      ]
    });
    const commit = await this.octokit.rest.git.createCommit({
      owner: this.owner,
      repo: this.repo,
      message: input.commitMessage,
      tree: tree.data.sha,
      parents: [baseSha]
    });

    await this.upsertBranch(input.prBranch, commit.data.sha);
    return this.upsertPullRequest(input.baseBranch, input.prBranch, input.prTitle, input.prBody);
  }

  private async collectCommits(baseBranch: string, since: Date, until: Date): Promise<CommitActivity[]> {
    const commits = (await this.octokit.paginate(this.octokit.rest.repos.listCommits, {
      owner: this.owner,
      repo: this.repo,
      sha: baseBranch,
      since: since.toISOString(),
      until: until.toISOString(),
      per_page: 100
    })) as Array<any>;

    return commits.map((commit) => ({
      sha: commit.sha,
      shortSha: String(commit.sha).slice(0, 7),
      message: commit.commit?.message ?? "",
      authorName: commit.commit?.author?.name,
      authorLogin: commit.author?.login,
      committedAt: commit.commit?.author?.date ?? commit.commit?.committer?.date,
      url: commit.html_url
    }));
  }

  private async collectPullRequests(
    baseBranch: string,
    since: Date,
    until: Date,
    excludedHeadBranch?: string
  ): Promise<PullRequestActivity[]> {
    const pullRequests: PullRequestActivity[] = [];
    let page = 1;

    while (true) {
      const response = await this.octokit.rest.pulls.list({
        owner: this.owner,
        repo: this.repo,
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: 100,
        page
      });
      const data = response.data;
      if (data.length === 0) {
        break;
      }

      for (const pullRequest of data) {
        if (pullRequest.base.ref !== baseBranch) {
          continue;
        }

        if (excludedHeadBranch && pullRequest.head.ref === excludedHeadBranch) {
          continue;
        }

        if (!isPullRequestInWindow(pullRequest, since, until)) {
          continue;
        }

        pullRequests.push({
          number: pullRequest.number,
          title: pullRequest.title,
          state: pullRequest.state,
          merged: Boolean(pullRequest.merged_at),
          authorLogin: pullRequest.user?.login,
          createdAt: pullRequest.created_at,
          updatedAt: pullRequest.updated_at,
          closedAt: pullRequest.closed_at ?? undefined,
          mergedAt: pullRequest.merged_at ?? undefined,
          url: pullRequest.html_url,
          labels: pullRequest.labels.map((label) => label.name)
        });
      }

      const oldestUpdatedAt = data.at(-1)?.updated_at;
      if (oldestUpdatedAt && new Date(oldestUpdatedAt).getTime() < since.getTime()) {
        break;
      }

      page += 1;
    }

    return pullRequests;
  }

  private async collectReleases(since: Date, until: Date): Promise<ReleaseActivity[]> {
    const releases: ReleaseActivity[] = [];
    let page = 1;

    while (true) {
      const response = await this.octokit.rest.repos.listReleases({
        owner: this.owner,
        repo: this.repo,
        per_page: 100,
        page
      });
      const data = response.data;
      if (data.length === 0) {
        break;
      }

      for (const release of data) {
        const activityDate = release.published_at ?? release.created_at;
        if (!isDateInWindow(activityDate, since, until)) {
          continue;
        }

        releases.push({
          tagName: release.tag_name,
          name: release.name ?? undefined,
          draft: release.draft,
          prerelease: release.prerelease,
          authorLogin: release.author?.login,
          createdAt: release.created_at,
          publishedAt: release.published_at ?? undefined,
          url: release.html_url
        });
      }

      const oldestDate = data.at(-1)?.published_at ?? data.at(-1)?.created_at;
      if (oldestDate && new Date(oldestDate).getTime() < since.getTime()) {
        break;
      }

      page += 1;
    }

    return releases;
  }

  private async upsertBranch(branch: string, sha: string): Promise<void> {
    try {
      await this.octokit.rest.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branch}`
      });
      await this.octokit.rest.git.updateRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branch}`,
        sha,
        force: true
      });
    } catch (error) {
      if (!isHttpStatus(error, 404)) {
        throw error;
      }

      await this.octokit.rest.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branch}`,
        sha
      });
    }
  }

  private async upsertPullRequest(
    baseBranch: string,
    prBranch: string,
    title: string,
    body: string
  ): Promise<PullRequestResult> {
    const existingPullRequests = await this.octokit.rest.pulls.list({
      owner: this.owner,
      repo: this.repo,
      state: "open",
      head: `${this.owner}:${prBranch}`,
      base: baseBranch,
      per_page: 10
    });
    const existingPullRequest = existingPullRequests.data[0];

    if (existingPullRequest) {
      const updated = await this.octokit.rest.pulls.update({
        owner: this.owner,
        repo: this.repo,
        pull_number: existingPullRequest.number,
        title,
        body
      });
      return {
        number: updated.data.number,
        url: updated.data.html_url,
        created: false
      };
    }

    const created = await this.octokit.rest.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      head: prBranch,
      base: baseBranch
    });

    return {
      number: created.data.number,
      url: created.data.html_url,
      created: true
    };
  }
}

function isPullRequestInWindow(pullRequest: any, since: Date, until: Date): boolean {
  return [
    pullRequest.created_at,
    pullRequest.updated_at,
    pullRequest.closed_at,
    pullRequest.merged_at
  ].some((date) => isDateInWindow(date, since, until));
}

function isDateInWindow(value: string | null | undefined, since: Date, until: Date): boolean {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();
  return time >= since.getTime() && time <= until.getTime();
}

function isHttpStatus(error: unknown, status: number): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === status;
}
