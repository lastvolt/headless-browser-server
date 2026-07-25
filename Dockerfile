# Playwright's official image ships the browsers + system deps preinstalled.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

COPY package*.json ./
# Browsers already in the image; skip the postinstall browser download.
RUN npm ci --omit=dev --ignore-scripts

COPY . .

# Chromium runs --no-sandbox (see app.js), so the container boundary is the sandbox —
# don't hand it root on top. pwuser ships in the Playwright base image and owns the
# browser install; /app stays root-owned read-only, which is all node needs.
USER pwuser

EXPOSE 3000
CMD ["node", "app.js"]
