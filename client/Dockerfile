FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
# next.config.js resolves rewrites() once at build time, so the API's in-network
# address must be set before building, not just on the runtime container.
ENV API_INTERNAL_ORIGIN=http://api:4000
RUN npm run build

FROM node:20-alpine AS run
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
