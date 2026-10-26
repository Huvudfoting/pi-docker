FROM node:24-bookworm-slim AS node-runtime

# The moving Python 3 tag tracks stable releases, not prereleases.
# Keep both stages on Bookworm so Node uses the same system ABI.
FROM python:3-slim-bookworm
COPY --from=node-runtime /usr/local/ /usr/local/
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
ENV UV_PYTHON_DOWNLOADS=never

# Preserve the non-root user supplied by the original Node base image.
RUN groupadd --gid 1000 node \
    && useradd --uid 1000 --gid node --shell /bin/bash --create-home node

# Install .deb packages
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        gh \
        curl \
        ca-certificates \
        libstdc++6 \
        openssh-client \
        ripgrep \
        nano \
    && rm -rf /var/lib/apt/lists/*

# Versions are selected in setup/pi/build-pi-docker.sh, not independently here.
ARG HERDR_VERSION
RUN : "${HERDR_VERSION:?Build with setup/pi/build-pi-docker.sh or pass HERDR_VERSION}" \
    && printf 'Building with Herdr v%s integration.\n' "$HERDR_VERSION" \
    && case "$(dpkg --print-architecture)" in \
        amd64) arch=x86_64 ;; \
        arm64) arch=aarch64 ;; \
        *) echo 'Unsupported Herdr architecture' >&2; exit 1 ;; \
    esac \
    && curl --fail --show-error --location --retry 3 \
        "https://github.com/herdrdev/herdr/releases/download/v${HERDR_VERSION}/herdr-linux-${arch}" \
        --output /usr/local/bin/herdr \
    && chmod 755 /usr/local/bin/herdr \
    && test "$(herdr --version)" = "herdr ${HERDR_VERSION}"

# Fail the build if either runtime or essential Python modules are unavailable.
RUN gh --version \
    && node --version \
    && npm --version \
    && python --version \
    && python3 -c "import bz2, ctypes, lzma, sqlite3, ssl, venv" \
    && python3 -m pip --version \
    && uv --version \
    && uvx --version

# Downloaded extensions: npm @latest in the image; homemade code: mounted folders.
# Deployment source is mounted read-only; keep private state outside setup/pi.
ARG PI_VERSION
RUN : "${PI_VERSION:?Build with setup/pi/build-pi-docker.sh or pass PI_VERSION}" \
    && npm install -g \
    "@earendil-works/pi-coding-agent@${PI_VERSION}" \
    pi-rewind-hook@latest \
    pi-web-access@latest \
    @juicesharp/rpiv-ask-user-question@latest \
    @specode/pi-subscription-usage@latest

RUN mkdir -p /pi/agent /pi/sessions /workspace \
	&& chown -R node:node /pi /workspace
USER node
WORKDIR /workspace
ENV PI_CODING_AGENT_DIR=/pi/agent \
    PI_CODING_AGENT_SESSION_DIR=/pi/sessions
ENTRYPOINT ["pi"]
