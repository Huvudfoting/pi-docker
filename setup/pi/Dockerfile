FROM node:24-bookworm-slim

# Install .deb packages
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
        openssh-client \
        ripgrep \
        nano \
    && rm -rf /var/lib/apt/lists/*

# Downloaded extensions: npm @latest in the image; homemade code: mounted folders.
# Deployment source is mounted read-only; keep private state outside setup/pi.
RUN npm install -g \
    @earendil-works/pi-coding-agent@latest \
    pi-rewind-hook@latest \
    pi-web-access@latest \
    @juicesharp/rpiv-ask-user-question@latest

RUN mkdir -p /pi/agent /pi/sessions /workspace \
	&& chown -R node:node /pi /workspace
USER node
WORKDIR /workspace
ENV PI_CODING_AGENT_DIR=/pi/agent \
    PI_CODING_AGENT_SESSION_DIR=/pi/sessions
ENTRYPOINT ["pi"]
