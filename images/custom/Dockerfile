# Build base first: ./bin/build
ARG BASE_IMAGE=pi-docker:base
# Keep Python and Node on Bookworm so copied Python binaries use the same ABI.
FROM python:3-slim-bookworm AS python-runtime
FROM ${BASE_IMAGE}

USER root
COPY --from=python-runtime /usr/local/ /usr/local/
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
ENV UV_PYTHON_DOWNLOADS=never \
    EDITOR=nano \
    VISUAL=nano

# Runtime libraries for the official Python image's interpreter and stdlib.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        nano libbz2-1.0 libdb5.3 libexpat1 libffi8 libgdbm6 libgdbm-compat4 \
        liblzma5 libncursesw6 libreadline8 libsqlite3-0 libssl3 libuuid1 zlib1g \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g \
    pi-rewind-hook@latest \
    pi-web-access@latest \
    pi-ask-user@latest \
    @specode/pi-subscription-usage@latest

# Image-owned resources do not pollute mounted/shared Pi configuration.
COPY custom/entrypoint /usr/local/bin/pi-custom
COPY custom/AGENTS.md /usr/local/share/pi-custom/AGENTS.md
COPY custom/skills/ /usr/local/share/pi-custom/skills/
RUN chmod 755 /usr/local/bin/pi-custom \
    && python --version \
    && python3 -c "import bz2, ctypes, dbm.gnu, lzma, readline, sqlite3, ssl, venv" \
    && python3 -m pip --version \
    && uv --version && uvx --version \
    && node --version && gh --version

USER node
ENTRYPOINT ["/usr/local/bin/pi-custom"]
