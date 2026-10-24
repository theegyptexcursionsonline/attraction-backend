# One exact Node.js release, written into the FROM line (an ARG would let a
# service variable replace it). 24.22.1 carries the 21 Oct 2026 Node.js security
# fixes; Nixpacks took Node from a nixpkgs snapshot (24.10.0) that has no
# patched release, so the image now starts from the official Node.js image.
# The steps are the previous Nixpacks plan: a full install (the operations
# scripts run inside the container use dev dependencies), the build, then
# `npm start`. No service variable crosses the build boundary.
# src/__tests__/runtimeNodeVersion.test.ts holds the floor.
FROM node:24.22.1-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

CMD ["npm", "start"]
