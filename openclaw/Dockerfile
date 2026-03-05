FROM node:22-slim

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

RUN npm install -g openclaw@latest

COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh

USER node
WORKDIR /home/node

RUN mkdir -p /home/node/.openclaw /home/node/.openclaw/workspace

EXPOSE 18789

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
