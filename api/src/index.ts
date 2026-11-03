import http from "http";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";

import { env } from "./config/env";
import { connectMongo } from "./config/db";
import { schema } from "./graphql/schema";
import { buildHttpContext, buildWsContext, GraphQLContext } from "./graphql/context";
import { registerLoyaltyListeners } from "./modules/loyalty/listeners";
import { registerInventoryListeners } from "./modules/inventory/listeners";
import { registerSheetsListeners } from "./modules/sheets/listeners";
import { backfillCompletedOrders, backfillOrderCodes, backfillRedemptions, backfillStatusHistory } from "./modules/orders/model";
import { markInterruptedCampaigns } from "./modules/newsletter/model";
import { seedHeroSlidesOnce } from "./modules/hero/model";
import { ensureCoffeeProcesses } from "./modules/coffee/model";
import { uploadsRouter, UPLOAD_DIR } from "./modules/uploads/router";

async function main() {
  await connectMongo();
  await backfillOrderCodes();
  await backfillCompletedOrders();
  await backfillStatusHistory();
  await backfillRedemptions();
  await markInterruptedCampaigns();
  await seedHeroSlidesOnce();
  await ensureCoffeeProcesses();
  registerLoyaltyListeners();
  registerInventoryListeners();
  await registerSheetsListeners();

  const app = express();
  const httpServer = http.createServer(app);

  // Cabeceras de seguridad de todas las respuestas de la API (las de las paginas las pone la web,
  // web/server/plugins/security-headers.ts). Sin X-Powered-By: no hace falta anunciar que es Express.
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (env.nodeEnv === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000");
    next();
  });

  // --- Subscriptions (websocket) ---
  const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" });
  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx) => buildWsContext(ctx.connectionParams ?? {}),
    },
    wsServer
  );

  // --- Queries / mutations (http) ---
  const apolloServer = new ApolloServer<GraphQLContext>({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await apolloServer.start();

  app.use(
    "/graphql",
    cors(),
    bodyParser.json(),
    expressMiddleware(apolloServer, {
      context: async ({ req }: { req: express.Request }) => buildHttpContext(req),
    })
  );

  // Archivos subidos: solo se sirven como imagenes. Si alguien colara otra cosa (el tipo se mira por
  // lo que declara el navegador), con esta politica no se ejecutaria nada al abrirlo.
  app.use(
    "/uploads",
    cors(),
    express.static(UPLOAD_DIR, {
      setHeaders: (res) => res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"),
    })
  );
  app.use("/uploads", cors(), uploadsRouter);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  httpServer.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] GraphQL listo en http://localhost:${env.port}/graphql`);
    // eslint-disable-next-line no-console
    console.log(`[api] Subscriptions en ws://localhost:${env.port}/graphql`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[api] error fatal al arrancar:", err);
  process.exit(1);
});
