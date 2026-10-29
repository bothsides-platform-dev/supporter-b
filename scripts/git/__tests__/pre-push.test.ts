import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const hook = resolve(".githooks/pre-push");
const zero = "0".repeat(40);
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "pre-push-"));
  dirs.push(dir);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  // Isolate the executable boundary: CI needs no global scanner installation.
  for (const [name, target] of Object.entries({
    bash: "/bin/bash",
    cat: "/bin/cat",
    git: "/usr/bin/git",
    node: process.execPath,
  })) {
    symlinkSync(target, join(bin, name));
  }
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("GIT_")) delete env[key];
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, env, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Hook test");
  git("config", "user.email", "hook@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", ".git/hooks");
  git("remote", "add", "origin", "https://example.invalid/repo.git");
  const commit = (content: string) => {
    writeFileSync(join(dir, "sample.txt"), content);
    git("add", "sample.txt");
    git("commit", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  };
  const base = commit("base\n");
  git("update-ref", "refs/remotes/origin/dev", base);
  copyFileSync(hook, join(dir, "pre-push"));
  writeFileSync(join(dir, ".gitleaks.toml"), "[extend]\nuseDefault = true\n");
  const log = join(dir, "scanner.jsonl");
  writeFileSync(
    join(bin, "gitleaks"),
    `#!/usr/bin/env node
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
const opts = args[args.indexOf('--log-opts') + 1];
const commits = execFileSync('git', ['log', '--format=%H', ...opts.split(' '), '--'], { encoding: 'utf8' }).trim().split('\\n').filter(Boolean);
fs.appendFileSync(process.env.SCANNER_LOG, JSON.stringify({ args, commits }) + '\\n');
process.exit(Number(process.env.SCANNER_EXIT || 0));
`,
    { mode: 0o755 },
  );
  const run = (
    input: string,
    extraEnv: Record<string, string> = {},
    remote = "origin",
  ) =>
    spawnSync(
      "/bin/bash",
      [join(dir, "pre-push"), remote, "https://example.invalid/repo.git"],
      {
        cwd: dir,
        input,
        encoding: "utf8",
        env: { ...env, PATH: bin, SCANNER_LOG: log, ...extraEnv },
      },
    );
  const scans = (): { args: string[]; commits: string[] }[] =>
    readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  return { dir, bin, git, base, commit, run, scans };
}

function update(local: string, remote: string, branch = "topic") {
  return `refs/heads/${branch} ${local} refs/heads/${branch} ${remote}\n`;
}

describe("pre-push secret gate", () => {
  it("scans every outgoing commit, including a value removed before the tip, and redacts output", () => {
    const f = fixture();
    const first = f.commit("sensitive value introduced\n");
    const tip = f.commit("value removed\n");
    const result = f.run(update(tip, f.base));
    expect(result.stderr).not.toContain("gstack");
    expect(result.status).toBe(0);
    expect(f.scans()[0].commits).toEqual([tip, first]);
    expect(f.scans()[0].args).toContain("--redact=100");
  });

  it("scans new branches relative to the destination remote, not other remotes", () => {
    const f = fixture();
    const tip = f.commit("new work\n");
    f.git("update-ref", "refs/remotes/elsewhere/topic", tip);
    expect(f.run(update(tip, zero)).status).toBe(0);
    expect(f.scans()[0].commits).toEqual([tip]);
  });

  it("allows deletion-only and empty pushes without requiring a scanner", () => {
    const f = fixture();
    rmSync(join(f.bin, "gitleaks"));
    expect(f.run(update(zero, f.base)).status).toBe(0);
    expect(f.run("").status).toBe(0);
  });

  it("blocks a push with installation guidance when Gitleaks is missing", () => {
    const f = fixture();
    rmSync(join(f.bin, "gitleaks"));
    const result = f.run(update(f.base, zero));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("brew install gitleaks");
  });

  it("requires fetching a missing remote base instead of treating a failed Git log as clean", () => {
    const f = fixture();
    const result = f.run(update(f.base, "1".repeat(40)));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("git fetch");
  });

  it.each([1, 2])(
    "blocks the push when the scanner returns %i (finding or execution error)",
    (code) => {
      const f = fixture();
      const tip = f.commit("new work\n");
      expect(
        f.run(update(tip, f.base), { SCANNER_EXIT: String(code) }).status,
      ).toBe(code);
    },
  );

  it("scans all updated refs in one push, skipping deleted refs", () => {
    const f = fixture();
    const first = f.commit("first\n");
    const second = f.commit("second\n");
    expect(
      f.run(
        update(first, f.base, "one") +
          update(zero, f.base, "deleted") +
          update(second, first, "two"),
      ).status,
    ).toBe(0);
    expect(f.scans().map((scan) => scan.commits)).toEqual([[first], [second]]);
  });

  it("scans full history for a new destination with no remote tracking refs", () => {
    const f = fixture();
    const tip = f.commit("first push\n");
    expect(
      f.run(update(tip, zero), {}, "https://example.invalid/new.git").status,
    ).toBe(0);
    expect(f.scans()[0].commits).toEqual([tip, f.base]);
  });

  it("checks commits on a rewritten branch even when the remote tip is not an ancestor", () => {
    const f = fixture();
    const oldTip = f.commit("old branch\n");
    f.git("checkout", "-q", "--detach", f.base);
    const newTip = f.commit("rewritten branch\n");
    expect(f.run(update(newTip, oldTip)).status).toBe(0);
    expect(f.scans()[0].commits).toEqual([newTip]);
  });

  it("preserves local hook arguments/stdin and honors its rejection before scanning", () => {
    const f = fixture();
    const input = update(f.base, zero) + update(zero, f.base, "deleted");
    const record = join(f.dir, "local.json");
    writeFileSync(
      join(f.dir, ".git/hooks/pre-push.local"),
      `#!/usr/bin/env node
require('node:fs').writeFileSync(process.env.LOCAL_LOG, JSON.stringify({ args: process.argv.slice(2), input: require('node:fs').readFileSync(0, 'utf8') }));
process.exit(Number(process.env.LOCAL_EXIT || 0));
`,
      { mode: 0o755 },
    );
    expect(f.run(input, { LOCAL_LOG: record, LOCAL_EXIT: "42" }).status).toBe(
      42,
    );
    expect(JSON.parse(readFileSync(record, "utf8"))).toEqual({
      args: ["origin", "https://example.invalid/repo.git"],
      input,
    });
    expect(() => f.scans()).toThrow();
    expect(f.run(input, { LOCAL_LOG: record }).status).toBe(0);
    expect(f.scans()).toHaveLength(1);
  });
});
