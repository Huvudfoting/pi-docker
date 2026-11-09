"use strict";
// Runs only INSIDE the selected image. No host Node dependency.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const e = process.env;
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
console.log(`Runtime: Node ${process.version}; ${git("--version")}`);
const decode = s => s.replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
const mounts = fs.readFileSync("/proc/self/mountinfo", "utf8").trim().split("\n").map(line => {
  const fields = line.split(" "); return { target: decode(fields[4]), options: fields[5].split(",") };
});
const mount = target => { const found = mounts.filter(m => m.target === target); assert.equal(found.length, 1, `one mount at ${target}`); return found[0]; };
assert.equal(fs.realpathSync(process.cwd()), e.PROBE_WORKDIR);
assert(mount(e.PROBE_TARGET).options.includes("rw"), "checkout writable");
assert(mount("/probe").options.includes("ro"), "test code read-only");
assert(mount("/").options.includes("ro"), "root filesystem read-only");
if (e.PROBE_METADATA === "1") assert(mount(e.PROBE_COMMON).options.includes("rw"), "common metadata writable");
if (e.PROBE_KIND === "external" && e.PROBE_METADATA === "0" && e.PROBE_COMMON !== e.PROBE_TARGET) {
  assert(!mounts.some(m => m.target === e.PROBE_COMMON), "contained metadata has no redundant bind");
}
if (e.PROBE_KIND === "external" && e.PROBE_TARGET !== "/workspace") {
  assert(!mounts.some(m => m.target === "/workspace"), "no residual /workspace project bind");
}
for (const target of ["/pi/agent", "/pi/sessions", "/run/gh-config", "/run/herdr/herdr.sock"]) {
  assert(!mounts.some(m => m.target === target), `no private mount at ${target}`);
}
assert(!e.HERDR_SOCKET_PATH && !e.HERDR_PANE_ID, "no inherited Herdr control context");
if (e.PROBE_MAIN_SENTINEL) assert(!fs.existsSync(e.PROBE_MAIN_SENTINEL), "original checkout source not exposed");
if (e.PROBE_KIND === "ordinary") {
  fs.writeFileSync("ordinary-written", "container write\n");
  console.log("PASS ordinary-directory working directory and write");
} else {
  const top = git("rev-parse", "--show-toplevel");
  assert.equal(top, e.PROBE_TARGET);
  git("status", "--porcelain");
  git("diff");
  const listing = git("worktree", "list", "--porcelain");
  assert(listing.includes("worktree "), "worktree listing available");
  if (e.PROBE_KIND === "external") {
    assert.equal(git("rev-parse", "--path-format=absolute", "--git-common-dir"), e.PROBE_COMMON);
    const gd = git("rev-parse", "--absolute-git-dir");
    assert(fs.statSync(gd).isDirectory());
    if (gd !== e.PROBE_COMMON) {
      const reverse = fs.readFileSync(path.join(gd, "gitdir"), "utf8").trim();
      assert.equal(fs.realpathSync(path.resolve(gd, reverse)), fs.realpathSync(path.join(top, ".git")));
    }
  }
  if (e.PROBE_ACTION === "write") {
    if (e.PROBE_BARRIER) {
      assert(["a", "b"].includes(e.PROBE_PARTICIPANT));
      fs.writeFileSync(`${e.PROBE_BARRIER}.${e.PROBE_PARTICIPANT}`, "ready\n");
      const end = Date.now() + 30000;
      while (!["a", "b"].every(p => fs.existsSync(`${e.PROBE_BARRIER}.${p}`))) {
        assert(Date.now() < end, "concurrent peer did not reach barrier; inspect both receipts");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
      console.log("PASS both writing containers reached shared barrier");
    }
    fs.appendFileSync(path.join(top, "tracked"), "container tracked edit\n");
    assert(git("-C", top, "diff", "--", "tracked").includes("container tracked edit"));
    const file = path.join(top, "container-change");
    fs.writeFileSync(file, `change in ${git("branch", "--show-current")}\n`);
    git("-C", top, "add", "--", "tracked", "container-change");
    assert(git("-C", top, "diff", "--cached").includes("container tracked edit"));
    git("-C", top, "commit", "-m", "container mount fixture");
    assert.equal(git("log", "-1", "--format=%s"), "container mount fixture");
    assert.equal(git("status", "--porcelain"), "");
    console.log("PASS Git add/commit and staged/unstaged diffs");
  }
  console.log("PASS Git discovery/status/diff/log/worktree-list");
  git("log", "-1", "--format=%s");
}
console.log("PASS effective mount destinations, access modes, working directory, and isolation from private mounts");
