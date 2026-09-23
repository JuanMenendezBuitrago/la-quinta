FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM base AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM base AS build
ARG GRAPHQL_HTTP_INTERNAL
ARG NUXT_PUBLIC_GRAPHQL_HTTP
ARG NUXT_PUBLIC_GRAPHQL_WS
ENV GRAPHQL_HTTP_INTERNAL=${GRAPHQL_HTTP_INTERNAL}
ENV NUXT_PUBLIC_GRAPHQL_HTTP=${NUXT_PUBLIC_GRAPHQL_HTTP}
ENV NUXT_PUBLIC_GRAPHQL_WS=${NUXT_PUBLIC_GRAPHQL_WS}
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
