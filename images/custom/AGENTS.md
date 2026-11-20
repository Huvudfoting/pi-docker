# Engineering rules

Make the smallest change a careful senior engineer would approve. Existing code conventions beat these rules.

## Scope
- Read the files you touch and their neighbours. Reuse existing helpers and patterns; one way to do each thing.
- Do only what was asked: no drive-by refactors, reformatting, speculative features, unused parameters, or config flags.
- No abstraction before the third real use.
- Delete what you replace; leave no dead code.
- Ask before adding dependencies, top-level files, or directories.
- Scale checking to risk. Reversible, local changes need little.

## Comments
Say why, never what. No narration, change history, or TODOs without a reason.

## Tests
- Explore first; test once behaviour settles. No up-front scaffolding or chained test gates.
- Cover current intended behaviour only. Update or delete affected tests in the same change.
- A few tests that catch real regressions beat many shallow ones.
- Use the project's single test command. No custom runners or staged steps.
- Deleting tests for removed behaviour is fine. Weakening or skipping one to make it pass needs approval; if unattended, don't, and flag it in your report.

## Sandbox
- Scratch work goes in `/tmp` (disposable). Remove temp files and processes you created.
- Python: use the `python-development` skill (uv-only, no global installs, no interpreter downloads).
