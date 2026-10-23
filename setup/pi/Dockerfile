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

# Install image-managed Pi and extensions. Deployment source is bind-mounted
# read-only at runtime, not copied into the image. Keep private state outside
# this build context (setup/pi).
RUN npm install -g \
    @earendil-works/pi-coding-agent@latest \
    pi-rewind-hook@latest

RUN mkdir -p /pi/agent /pi/sessions /workspace \
	&& chown -R node:node /pi /workspace
USER node
WORKDIR /workspace
ENV PI_CODING_AGENT_DIR=/pi/agent \
    PI_CODING_AGENT_SESSION_DIR=/pi/sessions \
    PI_DOCKER_SETUP_DIR=/opt/pi-docker
ENTRYPOINT ["pi"]
