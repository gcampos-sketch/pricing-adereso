FROM node:22-bookworm-slim AS build
WORKDIR /app/dashboard-sales
COPY dashboard-sales/package.json dashboard-sales/package-lock.json ./
RUN npm ci
COPY dashboard-sales/ ./
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID
COPY starfield.js starfield.d.ts logoadereso.webp /app/
RUN npm run build
WORKDIR /app
COPY index.html starfield.js roi-standalone.js roi-share.js wallet-standalone.js wallet-share.js brand-system.css chapter-index.js academy-sync.js commercial-guides.js dashboard-settings.js logoadereso.webp e6e8672e.webp ./private-hub/
COPY assets/adereso-symbol.svg ./private-hub/assets/adereso-symbol.svg
COPY academy/index.html ./private-hub/academy/index.html
COPY argumentaciones/index.html ./private-hub/argumentaciones/index.html
COPY operativa/index.html ./private-hub/operativa/index.html
COPY playbook/index.html ./private-hub/playbook/index.html
COPY dashboard/index.html ./private-hub/dashboard/index.html

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/dashboard-sales/.output ./.output
COPY --from=build --chown=node:node /app/private-hub ./private-hub
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
