# Playwright's official image ships the browsers + system deps preinstalled.
#
# THIS TAG MUST MATCH the playwright version in package-lock.json. The image's browser
# builds are version-specific: `npm ci --ignore-scripts` below downloads NO browsers, so
# a newer library looks for a browser revision the image doesn't have and the container
# crash-loops with "Executable doesn't exist at /ms-playwright/...". Bump both together.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

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
