FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Local development. Source is bind-mounted at runtime and nodemon restarts on change.
FROM deps AS dev
ENV NODE_ENV=development
COPY nodemon.json tsconfig.json ./
COPY src ./src
EXPOSE 4000
CMD ["npm", "run", "dev", "--", "--legacy-watch"]

FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV HUSKY=0
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS prod-deps
WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /app/uploads/products && chown -R node:node /app/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]
