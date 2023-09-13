FROM oven/bun:1.0 as build

ARG USERNAME=nonroot
ARG USER_GROUP=nonroot
RUN groupadd -g 10001 $USER_GROUP && useradd -m -u 10000 -g $USER_GROUP $USERNAME
USER ${USERNAME}:${USER_GROUP}

WORKDIR /app

COPY --chown=${USERNAME}:${USER_GROUP} . .

RUN bun install --production --no-cache && bun run build

FROM gcr.io/distroless/base:nonroot

COPY --from=build --chown=nonroot:nonroot /app/build .

CMD ["./app"]