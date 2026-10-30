# Painel do Hermes: build do front (Vite) e servidor Node com a API.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
# python3 roda o posts.py (aprovar posts); tzdata para o "hoje" em Brasília.
RUN apk add --no-cache python3 tzdata
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
ENV PORTA=3005 PAINEL_DADOS=/data HERMES_POSTS=/hermes/posts POSTS_PY=/app/posts.py NODE_ENV=production
EXPOSE 3005
USER node
CMD ["node", "server/index.js"]
