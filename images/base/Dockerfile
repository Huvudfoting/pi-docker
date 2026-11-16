# Base: sandboxed Pi with optional-at-launch Herdr and GitHub integration.
FROM node:24-bookworm-slim

# Update image-managed versions here; host Herdr is managed separately.
ARG PI_VERSION=1.5.2
ARG HERDR_VERSION=0.9.5

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
    && rm -rf /var/lib/apt/lists/*

# Extract the matching CLI's skill outside mounted configuration.
RUN : "${HERDR_VERSION:?HERDR_VERSION must not be empty}" \
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
    && test "$(herdr --version)" = "herdr ${HERDR_VERSION}" \
    && mkdir -p /usr/local/share/pi-skills/herdr \
    && herdr --skill > /usr/local/share/pi-skills/herdr/SKILL.md \
    && test -s /usr/local/share/pi-skills/herdr/SKILL.md \
    && chmod 644 /usr/local/share/pi-skills/herdr/SKILL.md

RUN gh --version && node --version && npm --version

# Only Pi belongs in base. Optional extensions live in images/custom/Dockerfile.
# The required Herdr reporter is prepared by host Herdr in mounted config.
RUN : "${PI_VERSION:?PI_VERSION must not be empty}" \
    && npm install -g "@earendil-works/pi-coding-agent@${PI_VERSION}"

COPY base/pi-update-guard /usr/local/bin/pi-update-guard
RUN chmod 755 /usr/local/bin/pi-update-guard \
    && mkdir -p /pi/agent /pi/sessions /workspace \
    && chown -R node:node /pi /workspace
USER node
WORKDIR /workspace
ENV PI_CODING_AGENT_DIR=/pi/agent \
    PI_CODING_AGENT_SESSION_DIR=/pi/sessions \
    PI_SELF_UPDATE_COMMAND=/usr/local/bin/pi-update-guard
ENTRYPOINT ["pi"]
