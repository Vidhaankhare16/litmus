FROM node:22-alpine

WORKDIR /app

# Litmus has no dependencies, so there is nothing to install.
COPY package.json server.js otari.js app.js index.html styles.css ./

# Cloud Run's own filesystem is in memory and resets on a new instance. The deployment mounts a
# Cloud Storage bucket and sets LITMUS_DATA_DIR to it, so plans, trails and the activity log survive.
# Without that mount, state lives under /tmp.
ENV LITMUS_DATA_DIR=/tmp/litmus-data
ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "server.js"]
