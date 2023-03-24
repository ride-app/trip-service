# Compile typescript
FROM node:lts-alpine as build

WORKDIR /app

COPY . .
RUN npm ci && npm run build

# Copy package.json and build node_modules
FROM node:lts-alpine as deps

WORKDIR /app

COPY package-lock.json package.json ./
RUN npm ci --production

# Copy node_modules from build and js files from local /build
FROM gcr.io/distroless/nodejs:16

WORKDIR /app

COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/build .
COPY package.json .

ENV NODE_ENV production

CMD ["index.js"]