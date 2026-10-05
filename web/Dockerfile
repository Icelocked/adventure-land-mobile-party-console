# Multi-stage build: compile the Vite app, then serve it (and proxy
# /party-api/* to the party-console coordinator) with nginx. See
# DEPLOYMENT.md for how to add this as a sibling service in the same
# docker-compose.yaml that runs party-console itself - same-origin
# proxying (see nginx.conf) is what makes this work at all.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# The push notifier (notifier/server.mjs) and its one dependency.
RUN cd notifier && npm ci --omit=dev

FROM nginx:alpine AS run
# Release builds pass the tag (e.g. 1.0.0); local builds stay unversioned,
# which tells the in-app updater to leave them alone.
ARG PWA_VERSION=""
ENV PWA_VERSION=$PWA_VERSION
LABEL org.opencontainers.image.version=$PWA_VERSION       org.opencontainers.image.source=https://github.com/Icelocked/adventure-land-mobile-party-console
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-locations.conf /etc/nginx/snippets/pwa-locations.conf
# Opt-in HTTPS: no-op unless a Tailscale cert is mounted at
# /etc/nginx/tailscale-certs - see the script itself and DEPLOYMENT.md
# section 3b for why (Android's PWA install criteria needs HTTPS).
COPY docker-entrypoint-tailscale-https.sh /docker-entrypoint.d/50-tailscale-https.sh
RUN chmod +x /docker-entrypoint.d/50-tailscale-https.sh
# Push notifier: a small Node process next to nginx (nginx proxies /notify/
# to it). Its keys and subscriptions live in /data/notifier - mount a volume
# there so they survive rebuilds.
RUN apk add --no-cache nodejs
COPY --from=build /app/notifier /opt/notifier
# Updater sidecar (same image, different command; see DEPLOYMENT.md).
COPY --from=build /app/updater /opt/updater
COPY docker-entrypoint-notifier.sh /docker-entrypoint.d/60-notifier.sh
RUN chmod +x /docker-entrypoint.d/60-notifier.sh
VOLUME /data/notifier
EXPOSE 80 443
