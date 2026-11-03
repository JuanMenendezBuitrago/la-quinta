FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# npm ci: exactamente lo que dice package-lock.json (lo mismo que se probo)
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# su-exec: para arrancar como root solo lo justo (ver docker-entrypoint.sh) y luego ser "node"
RUN apk add --no-cache su-exec
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
