FROM node:22-slim

RUN apt-get update && apt-get install -y git gosu && rm -rf /var/lib/apt/lists/*

RUN npm install -g openclaw@latest

COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh
COPY config/config.json /home/node/config.template.json

RUN chown node:node /home/node/config.template.json

WORKDIR /home/node

RUN mkdir -p /home/node/.openclaw /home/node/.openclaw/workspace && \
    chown -R node:node /home/node/.openclaw

EXPOSE 18789

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
