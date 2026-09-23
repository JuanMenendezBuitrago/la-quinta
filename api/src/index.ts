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
import { backfillOrderCodes } from "./modules/orders/model";
import { seedHeroSlidesOnce } from "./modules/hero/model";
import { uploadsRouter, UPLOAD_DIR } from "./modules/uploads/router";

async function main() {
  await connectMongo();
  await backfillOrderCodes();
  await seedHeroSlidesOnce();
  registerLoyaltyListeners();
  registerInventoryListeners();
  await registerSheetsListeners();

  const app = express();
  const httpServer = http.createServer(app);

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

  app.use("/uploads", cors(), express.static(UPLOAD_DIR));
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
