# Playwright's image ships Chromium plus every system library it needs.
# The tag must match the "playwright" version in package-lock.json.
FROM mcr.microsoft.com/playwright:v1.64.0-noble

WORKDIR /app
ENV NODE_ENV=production \
    HEADLESS=true \
    PORT=5001 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
# Dev dependencies stay installed: tsc builds the app and the prisma CLI runs `db push` at start.
RUN npm ci --include=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 5001
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
