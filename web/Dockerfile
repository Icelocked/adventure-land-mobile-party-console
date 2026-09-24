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

FROM nginx:alpine AS run
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Opt-in HTTPS: no-op unless a Tailscale cert is mounted at
# /etc/nginx/tailscale-certs - see the script itself and DEPLOYMENT.md
# section 3b for why (Android's PWA install criteria needs HTTPS).
COPY docker-entrypoint-tailscale-https.sh /docker-entrypoint.d/50-tailscale-https.sh
RUN chmod +x /docker-entrypoint.d/50-tailscale-https.sh
EXPOSE 80 443
