#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const [major, minor] = version.split(".");

if (!major || !minor) {
  throw new Error(`Invalid package version: ${version}`);
}

const versionTag = `v${version}`;
const majorTag = `v${major}`;
const minorTag = `v${major}.${minor}`;

execFileSync("git", ["config", "user.name", "github-actions[bot]"], { stdio: "inherit" });
execFileSync("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], {
  stdio: "inherit",
});
execFileSync("git", ["fetch", "--tags", "origin"], { stdio: "inherit" });
execFileSync("git", ["rev-parse", "--verify", versionTag], { stdio: "inherit" });
execFileSync("git", ["tag", "-fa", majorTag, "-m", `Release ${majorTag}`, versionTag], { stdio: "inherit" });
execFileSync("git", ["tag", "-fa", minorTag, "-m", `Release ${minorTag}`, versionTag], { stdio: "inherit" });
execFileSync("git", ["push", "origin", majorTag, minorTag, "--force"], { stdio: "inherit" });
