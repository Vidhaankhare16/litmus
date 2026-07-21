FROM node:22-alpine

WORKDIR /app

# Litmus has no dependencies, so there is nothing to install.
COPY package.json ./
COPY server.js app.js index.html styles.css github-app-manifest.json ./

# Cloud Run mounts an in-memory filesystem, so keep state under /tmp.
ENV LITMUS_DATA_DIR=/tmp/litmus-data
ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "server.js"]
