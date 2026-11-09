FROM node:22-alpine

WORKDIR /app

# Litmus has no dependencies, so there is nothing to install.
COPY package.json server.js otari.js app.js index.html styles.css ./

# Cloud Run's filesystem is in memory, so state lives under /tmp and resets on a new instance.
ENV LITMUS_DATA_DIR=/tmp/litmus-data
ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "server.js"]
