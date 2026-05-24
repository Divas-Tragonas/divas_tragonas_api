# Stage 1: Build
FROM node:20-alpine AS builder

RUN npm install -g pnpm@9 --quiet

WORKDIR /build

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/

RUN pnpm build

# Stage 2: Runtime
FROM node:20-alpine AS runtime

RUN npm install -g pnpm@9 --quiet

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /build/dist ./dist

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

CMD ["node", "dist/server.js"]
