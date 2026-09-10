FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Self-signed cert, baked in at build time so it's stable across container
# restarts (not regenerated on every boot). CERT_SAN_IP must be the address
# this service is actually reached at — browsers check SAN, not just CN.
# Override at build time (Portainer: stack build args, or `--build-arg`)
# if that address changes. See src/server.ts for the HTTPS/HTTP fallback
# logic and README.md for the "browsers don't trust this automatically"
# caveat that comes with not paying for a real cert.
ARG CERT_SAN_IP=192.168.86.205
RUN apk add --no-cache openssl \
 && mkdir -p /app/certs \
 && openssl req -x509 -nodes -newkey rsa:2048 \
      -keyout /app/certs/key.pem -out /app/certs/cert.pem \
      -days 825 -subj "/CN=se-runbook-listener" \
      -addext "subjectAltName=IP:${CERT_SAN_IP}"

COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8080
# Applies schema.sql (idempotent) then starts the API — safe on every deploy.
CMD ["sh", "-c", "npm run migrate && npm start"]
