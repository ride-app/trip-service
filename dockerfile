# Setup node environment
FROM node:lts-alpine@sha256:df01469346db2bf1cfc1f7261aeab86b2960efa840fe2bd46d83ff339f463665 as base
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
FROM gcr.io/distroless/nodejs18-debian11@sha256:c3627dd28e9e031c6b562eb7cb77c324b9c4635a1c05eaf8e89d2eaa364fa6f0

WORKDIR /app

COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/build .
COPY package.json .

ENV NODE_ENV production

CMD ["index.js"]