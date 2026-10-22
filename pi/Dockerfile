FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates openssh-client ripgrep && rm -rf /var/lib/apt/lists/*
RUN npm install -g @earendil-works/pi-coding-agent@latest
RUN mkdir -p /pi/agent /pi/sessions /workspace \
	&& chown -R node:node /pi /workspace
USER node
WORKDIR /workspace
ENV PI_CODING_AGENT_DIR=/pi/agent
ENTRYPOINT ["pi"]
