FROM node:20-bookworm-slim
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-noto-core fonts-liberation tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && fc-list | grep -qi "Noto Sans Devanagari" && fc-list | grep -qi "Liberation Serif"
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
RUN mkdir -p /app/storage/branding /app/storage/tmp && chown -R node:node /app
USER node
EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
