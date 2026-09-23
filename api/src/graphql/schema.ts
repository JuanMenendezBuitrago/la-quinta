import { mergeTypeDefs, mergeResolvers } from "@graphql-tools/merge";
import { makeExecutableSchema } from "@graphql-tools/schema";

import { usersTypeDefs } from "../modules/users/schema";
import { usersResolvers } from "../modules/users/resolvers";
import { menuTypeDefs } from "../modules/menu/schema";
import { menuResolvers } from "../modules/menu/resolvers";
import { ordersTypeDefs } from "../modules/orders/schema";
import { ordersResolvers } from "../modules/orders/resolvers";
import { loyaltyTypeDefs } from "../modules/loyalty/schema";
import { loyaltyResolvers } from "../modules/loyalty/resolvers";
import { settingsTypeDefs } from "../modules/settings/schema";
import { settingsResolvers } from "../modules/settings/resolvers";
import { privacyTypeDefs } from "../modules/privacy/schema";
import { privacyResolvers } from "../modules/privacy/resolvers";
import { customersTypeDefs } from "../modules/customers/schema";
import { customersResolvers } from "../modules/customers/resolvers";

// Tipos raiz: cada modulo los extiende con "extend type Query { ... }" etc.
const rootTypeDefs = /* GraphQL */ `
  type Query {
    _health: String!
  }
  type Mutation {
    _noop: Boolean
  }
  type Subscription {
    _noop: Boolean
  }
`;

const typeDefs = mergeTypeDefs([
  rootTypeDefs,
  usersTypeDefs,
  menuTypeDefs,
  ordersTypeDefs,
  loyaltyTypeDefs,
  settingsTypeDefs,
  privacyTypeDefs,
  customersTypeDefs,
]);

const resolvers = mergeResolvers([
  { Query: { _health: () => "ok" } },
  usersResolvers,
  menuResolvers,
  ordersResolvers,
  loyaltyResolvers,
  settingsResolvers,
  privacyResolvers,
  customersResolvers,
]);

export const schema = makeExecutableSchema({ typeDefs, resolvers });
