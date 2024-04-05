# Setup node environment
FROM node:lts-alpine@sha256:ebdb58b0d966033381e8eda11dad66a70dc22df2e1e36b5050fbd547299addae as base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

COPY . .

# Install dependencies
FROM base AS deps
RUN pnpm install --prod --frozen-lockfile

# Compile typescript
FROM base AS build
RUN pnpm install --frozen-lockfile && \
  pnpm run build

# Copy node_modules from build and js files from local /build
FROM gcr.io/distroless/nodejs18-debian11@sha256:233b199708eed32ccbb56d4d644303a623412c33f9330a95eca3570774340c2d

WORKDIR /app

COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/build .
COPY package.json .

ENV NODE_ENV production

CMD ["index.js"]