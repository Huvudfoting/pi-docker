---
name: python-development
description: Work on Python projects using the custom image's Python and uv tools. Use for Python development, not Herdr integration.
---

# Python development

Follow the project's existing workflow and lockfile. For uv projects, run
`uv sync`; otherwise use `uv venv` then `uv pip install <package>` in a local
`.venv`. Do not install packages globally.

Python, pip, and uv/uvx are provided. `UV_PYTHON_DOWNLOADS=never` disables automatic
interpreter downloads. Different interpreters/system packages require a custom
image rebuild on the host. Run documented project tests and report limitations;
do not read real credential/environment files merely to diagnose dependencies.
