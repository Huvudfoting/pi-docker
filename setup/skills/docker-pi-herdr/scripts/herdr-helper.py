#!/usr/bin/env python3
"""Narrow Docker-Pi start/ask adapter. No persistent state or raw socket client."""
import argparse
import json
import math
import os
import re
import selectors
import signal
import stat
import subprocess
import sys
import time

NAME = re.compile(r"[a-z][a-z0-9_-]{0,31}\Z")
PANE = re.compile(r"w[0-9]+:p[0-9]+\Z")
READY = {"idle", "done"}
MAX_WIRE = 1024 * 1024


class Failure(Exception):
    def __init__(self, code, message, *, upstream=None, exit_code=None):
        super().__init__(message)
        self.detail = {"code": code if isinstance(code, str) else "upstream_error",
                       "message": message if isinstance(message, str) else "Malformed upstream error message"}
        if upstream is not None:
            self.detail["upstream"] = upstream
        if exit_code is not None:
            self.detail["cli_exit_code"] = exit_code


class Cancelled(Failure):
    def __init__(self, signum):
        super().__init__("cancelled", f"received signal {signum}; no further I/O")


def excerpt(text, lines=40, size=16384):
    # Terminal evidence is untrusted. Strip ANSI and remaining C0/C1 controls.
    clean = re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    clean = "".join(c for c in clean if c in "\n\t" or (ord(c) >= 32 and not 127 <= ord(c) <= 159))
    tail = "\n".join(clean.splitlines()[-lines:])
    data = tail.encode("utf-8")
    tail = data[-size:].decode("utf-8", errors="ignore")
    return {"text": tail, "truncated": len(data) > size or len(clean.splitlines()) > lines,
            "trust": "untrusted"}


class Workflow:
    def __init__(self, args):
        self.args = args
        self.deadline = time.monotonic() + args.deadline_seconds
        self.receipt = {"schema_version": 1, "operation": args.operation, "stage": "validate",
                        "status": "failure", "pane_id": None, "agent": None,
                        "mutation": "not_attempted", "startup": "not_attempted", "delivery": "not_attempted"}
        self.target = None

    def fail(self, code, message):
        raise Failure(code, message)

    def remaining(self):
        return max(0, self.deadline - time.monotonic())

    def call(self, argv, *, raw=False, wait=False, effect=None, limit=5):
        end = min(self.deadline, time.monotonic() + limit)
        timeout = end - time.monotonic()
        if timeout <= 0:
            self.fail("deadline_exceeded", "absolute workflow deadline exhausted")
        # Give the upstream wait a little less than the client budget, so its
        # own error can normally reach us. Never extend the absolute deadline.
        if wait:
            argv = [*argv, "--timeout", str(max(1, min(self.args.timeout_ms, int((timeout - .1) * 1000))))]
        before = self.receipt.get(effect) if effect else None
        if effect:
            self.receipt[effect] = "uncertain"
        try:
            proc = subprocess.Popen(["herdr", *argv], stdin=subprocess.DEVNULL,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    start_new_session=True)
        except OSError as exc:
            if effect:
                self.receipt[effect] = before
            raise Failure("cli_unavailable", str(exc)) from exc
        buffers = {"stdout": bytearray(), "stderr": bytearray()}
        try:
            with selectors.DefaultSelector() as selector:
                for key, pipe in (("stdout", proc.stdout), ("stderr", proc.stderr)):
                    os.set_blocking(pipe.fileno(), False)
                    selector.register(pipe, selectors.EVENT_READ, key)
                while selector.get_map():
                    left = end - time.monotonic()
                    if left <= 0:
                        self.fail("client_timeout", "Herdr CLI exceeded client deadline; remote operation may continue")
                    for event, _ in selector.select(min(left, .1)):
                        chunk = os.read(event.fileobj.fileno(), 65536)
                        if not chunk:
                            selector.unregister(event.fileobj)
                        else:
                            buffers[event.data].extend(chunk)
                            if sum(map(len, buffers.values())) > MAX_WIRE:
                                self.fail("response_too_large", "Herdr CLI response exceeded 1 MiB")
                try:
                    code = proc.wait(timeout=max(.001, end - time.monotonic()))
                except subprocess.TimeoutExpired:
                    self.fail("client_timeout", "Herdr CLI did not exit within client deadline")
        except OSError as exc:
            raise Failure("client_io_error", str(exc)) from exc
        finally:
            # Only stop our local CLI child, never the remote pane/agent.
            if proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            proc.wait(timeout=1)
            proc.stdout.close()
            proc.stderr.close()
        out, err = (buffers[k].decode("utf-8", errors="replace") for k in ("stdout", "stderr"))
        if code != 0:
            for text in (err, out):
                try:
                    value = json.loads(text)
                except (ValueError, RecursionError):
                    continue
                if isinstance(value, dict) and isinstance(value.get("error"), dict):
                    error = value["error"]
                    if effect == "delivery" and error.get("code") == "agent_blocked":
                        self.receipt["delivery"] = "rejected"
                    raise Failure(error.get("code", "upstream_error"), error.get("message", "Herdr error"),
                                  upstream=error, exit_code=code)
            raise Failure("cli_failed", excerpt(err or out, 12, 2048)["text"] or "Herdr CLI failed",
                          exit_code=code)
        if raw:
            return out
        try:
            envelope = json.loads(out)
        except (ValueError, RecursionError) as exc:
            raise Failure("malformed_response", "expected a Herdr JSON envelope") from exc
        if not isinstance(envelope, dict):
            self.fail("malformed_response", "expected a Herdr JSON object")
        if isinstance(envelope.get("error"), dict):
            error = envelope["error"]
            if effect == "delivery" and error.get("code") == "agent_blocked":
                self.receipt["delivery"] = "rejected"
            raise Failure(error.get("code", "upstream_error"), error.get("message", "Herdr error"),
                          upstream=error, exit_code=code)
        result = envelope.get("result")
        if not isinstance(result, dict):
            self.fail("malformed_response", "missing Herdr result object")
        return result

    def agent(self, result):
        agent = result.get("agent")
        if not isinstance(agent, dict) or not all(isinstance(agent.get(k), str) and agent[k]
                                                   for k in ("pane_id", "terminal_id", "agent_status")):
            self.fail("malformed_response", "missing agent identity/state")
        if not PANE.fullmatch(agent["pane_id"]):
            self.fail("malformed_response", "invalid returned pane ID")
        if (agent.get("name") is not None and
                (not isinstance(agent["name"], str) or not NAME.fullmatch(agent["name"]))):
            self.fail("malformed_response", "invalid returned agent name")
        if (agent["agent_status"] not in READY | {"working", "blocked", "unknown"} or
                not isinstance(agent.get("agent"), str) or not agent["agent"]):
            self.fail("malformed_response", "invalid agent kind/state")
        return agent

    def remember(self, agent):
        previous = self.receipt["agent"]
        if self.receipt["pane_id"] not in (None, agent["pane_id"]):
            self.receipt["observed_agent"] = agent
            self.fail("identity_changed", "agent no longer occupies the known pane")
        if previous and any(previous.get(k) != agent.get(k) for k in ("pane_id", "terminal_id", "name", "agent")):
            self.receipt["observed_agent"] = agent
            self.fail("identity_changed", "observed agent identity changed; no resend")
        self.receipt["pane_id"] = agent["pane_id"]
        self.receipt["agent"] = agent
        # Pin subsequent calls to the resolved terminal location, not a reusable
        # live alias. Upstream validates the occupant; snapshots cannot reserve it.
        self.target = agent["pane_id"]

    def ready(self, agent):
        if agent["agent_status"] not in READY or agent.get("interactive_ready") is not True or agent.get("launch_pending", False):
            self.fail("target_not_ready", "workflow requires idle/done, interactive_ready, non-pending agent")

    def validate(self):
        env = os.environ
        socket = env.get("HERDR_SOCKET_PATH", "")
        try:
            valid_socket = os.path.isabs(socket) and stat.S_ISSOCK(os.stat(socket).st_mode)
        except OSError:
            valid_socket = False
        if env.get("HERDR_ENV") != "1" or not PANE.fullmatch(env.get("HERDR_PANE_ID", "")) or not valid_socket:
            self.fail("invalid_context", "requires inherited Herdr pane context and existing absolute Unix socket")
        # Do not rewrite env, select another server, or probe to identify context.
        if not 1 <= self.args.deadline_seconds <= 360 or not 1 <= self.args.timeout_ms <= 300000:
            self.fail("invalid_input", "deadline-seconds must be 1..360; timeout-ms must be 1..300000")
        if self.args.operation == "start":
            root = env.get("PI_DOCKER_HOST_WORKSPACE", "")
            if not os.path.isabs(root) or any(ord(c) < 32 or ord(c) == 127 for c in root):
                self.fail("invalid_host_workspace", "requires absolute PI_DOCKER_HOST_WORKSPACE; start a fresh integrated container")
            if not NAME.fullmatch(self.args.name):
                self.fail("invalid_input", "name must match [a-z][a-z0-9_-]{0,31}")
            return root
        if not (NAME.fullmatch(self.args.target) or PANE.fullmatch(self.args.target)):
            self.fail("invalid_input", "target must be an explicit live name or pane ID")
        if not self.args.prompt.strip() or "\0" in self.args.prompt or len(self.args.prompt.encode()) > 32768:
            self.fail("invalid_input", "prompt must be nonempty, NUL-free, and at most 32 KiB")
        if not 1 <= self.args.lines <= 120:
            self.fail("invalid_input", "lines must be 1..120")

    def start(self, root):
        r = self.receipt
        r["requested_name"] = self.args.name
        r["host_workspace"] = root
        r["stage"] = "check_alias"
        agents = self.call(["agent", "list"]).get("agents")
        if not isinstance(agents, list) or any(not isinstance(a, dict) for a in agents):
            self.fail("malformed_response", "missing agent list")
        if any(a.get("name") == self.args.name for a in agents):
            self.fail("duplicate_name", "live agent name already exists; no pane created")
        direction = self.args.direction
        if direction == "auto":
            r["stage"] = "layout"
            layout = self.call(["pane", "layout", "--pane", os.environ["HERDR_PANE_ID"]]).get("layout", {})
            try:
                if not isinstance(layout, dict):
                    raise ValueError()
                pane = next(p for p in layout["panes"] if p["pane_id"] == os.environ["HERDR_PANE_ID"])
                width, height = pane["rect"]["width"], pane["rect"]["height"]
                if not all(type(n) in (int, float) and math.isfinite(n) and n > 0 for n in (width, height)):
                    raise ValueError()
            except (KeyError, TypeError, StopIteration, ValueError, OverflowError):
                self.fail("malformed_response", "caller pane geometry missing/invalid")
            direction = "right" if width >= 80 and width >= height * 2 else "down"
        r["direction"] = direction
        r["stage"] = "split"
        result = self.call(["pane", "split", "--current", "--direction", direction,
                            "--cwd", root, "--no-focus"], effect="mutation")
        pane = result.get("pane", {}).get("pane_id") if isinstance(result.get("pane"), dict) else None
        if not isinstance(pane, str) or not PANE.fullmatch(pane):
            self.fail("malformed_response", "split returned no valid pane ID; creation uncertain")
        r["pane_id"] = pane  # Retain immediately, before startup or further validation.
        r["mutation"] = "pane_created"
        if pane == os.environ["HERDR_PANE_ID"]:
            self.fail("malformed_response", "split returned caller pane; refusing startup")
        r["stage"] = "start"
        # Timeout precedes native args: never append it past the -- separator.
        budget = min(self.args.timeout_ms, max(1, int((self.remaining() - .1) * 1000)))
        result = self.call(["agent", "start", self.args.name, "--kind", "pi", "--pane", pane,
                            "--timeout", str(budget), "--", root, "--name", self.args.name, "--herdr"],
                           effect="startup", limit=min(self.args.timeout_ms / 1000 + 1, self.remaining()))
        r["startup"] = "acknowledged"
        self.remember(self.agent(result))
        if r["agent"].get("name") != self.args.name or r["agent"].get("agent") != "pi":
            self.fail("identity_changed", "startup did not return requested Pi identity")
        r["stage"] = "resolve_started"
        self.remember(self.agent(self.call(["agent", "get", self.target])))
        self.ready(r["agent"])
        r["mutation"] = "agent_ready"

    def ask(self):
        r = self.receipt
        r["requested_target"] = self.args.target
        r["stage"] = "resolve_target"
        self.remember(self.agent(self.call(["agent", "get", self.args.target])))
        if r["pane_id"] == os.environ["HERDR_PANE_ID"]:
            self.fail("invalid_target", "cannot synchronously ask the calling agent")
        self.ready(r["agent"])
        r["stage"] = "prompt"
        result = self.call(["agent", "prompt", self.target, self.args.prompt, "--wait"],
                           wait=True, effect="delivery", limit=self.args.timeout_ms / 1000 + 1)
        r["delivery"] = "acknowledged"
        self.remember(self.agent(result))
        r["stage"] = "inspect_settled"
        self.remember(self.agent(self.call(["agent", "get", self.target])))
        # Blocked is a settled observation, not approval to answer its dialog.
        if r["agent"]["agent_status"] not in READY | {"blocked"}:
            self.fail("not_settled", "agent no longer settled after prompt wait")
        r["stage"] = "read"
        r["output"] = excerpt(self.call(["agent", "read", self.target, "--source", "recent-unwrapped",
                                         "--lines", str(self.args.lines)], raw=True), self.args.lines)
        r["stage"] = "verify_identity"
        self.remember(self.agent(self.call(["agent", "get", self.target])))
        if r["agent"]["agent_status"] not in READY | {"blocked"}:
            self.fail("not_settled", "agent resumed work during output retrieval")
        r["task_completion"] = "not_asserted"

    def run(self):
        try:
            root = self.validate()
            if self.args.operation == "start":
                self.start(root)
            else:
                self.ask()
            self.receipt.update(status="success", stage="complete")
        except Failure as exc:
            self.receipt["error"] = exc.detail
            if self.receipt["mutation"] != "not_attempted" or self.receipt["delivery"] != "not_attempted":
                self.receipt["status"] = "partial_failure"
            # Small best-effort evidence, same absolute deadline, never on cancel.
            if not isinstance(exc, Cancelled) and self.target and self.remaining() > .05:
                try:
                    text = self.call(["agent", "read", self.target, "--source", "recent-unwrapped", "--lines", "12"],
                                     raw=True, limit=1.5)
                    self.receipt["diagnostic"] = excerpt(text, 12, 2048)
                except Failure as diagnostic:
                    self.receipt["diagnostic_error"] = diagnostic.detail
        return self.receipt


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise Failure("invalid_arguments", message)


def main():
    parser = Parser(description=__doc__, allow_abbrev=False)
    sub = parser.add_subparsers(dest="operation", required=True, parser_class=Parser)
    for op in ("start", "ask"):
        cmd = sub.add_parser(op, allow_abbrev=False)
        cmd.add_argument("--timeout-ms", type=int, default=120000, help="upstream wait cap (1..300000)")
        cmd.add_argument("--deadline-seconds", type=int, default=150, help="whole workflow budget (1..360)")
        if op == "start":
            cmd.add_argument("--name", required=True)
            cmd.add_argument("--direction", choices=("auto", "right", "down"), default="auto")
        else:
            cmd.add_argument("--target", required=True)
            cmd.add_argument("--prompt", required=True)
            cmd.add_argument("--lines", type=int, default=40)
    def cancel(signum, _frame):
        raise Cancelled(signum)
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, cancel)
    try:
        receipt = Workflow(parser.parse_args()).run()
    except Failure as exc:
        receipt = {"schema_version": 1, "operation": None, "stage": "arguments",
                   "status": "failure", "error": exc.detail, "pane_id": None, "agent": None,
                   "mutation": "not_attempted", "startup": "not_attempted", "delivery": "not_attempted"}
    print(json.dumps(receipt, ensure_ascii=True))
    return 0 if receipt["status"] == "success" else (2 if receipt["error"]["code"] in {
        "invalid_arguments", "invalid_input", "invalid_context", "invalid_host_workspace", "invalid_target"} else 1)


if __name__ == "__main__":
    sys.exit(main())
