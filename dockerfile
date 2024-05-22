# Setup node environment
FROM node:lts-alpine@sha256:49344ed404f74b38ba538026c3f2a83444a13363585b5efec25fe6f53e0fbb00 as base
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
FROM gcr.io/distroless/nodejs18-debian11@sha256:492e41b27114961b09bc3f19253a625ab0dec5fa1d53f8a825bffb53827ea630

WORKDIR /app

COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/build .
COPY package.json .

ENV NODE_ENV production

CMD ["index.js"]