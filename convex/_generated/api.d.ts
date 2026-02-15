/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as padel from "../padel.js";
import type * as padel_auth from "../padel/auth.js";
import type * as padel_constants from "../padel/constants.js";
import type * as padel_date_time from "../padel/date_time.js";
import type * as padel_events from "../padel/events.js";
import type * as padel_handlers_matches from "../padel/handlers_matches.js";
import type * as padel_handlers_notifications from "../padel/handlers_notifications.js";
import type * as padel_handlers_push from "../padel/handlers_push.js";
import type * as padel_handlers_users from "../padel/handlers_users.js";
import type * as padel_match_view from "../padel/match_view.js";
import type * as padel_matches_repo from "../padel/matches_repo.js";
import type * as padel_notifications_service from "../padel/notifications_service.js";
import type * as padel_push_message from "../padel/push_message.js";
import type * as padel_types from "../padel/types.js";
import type * as padel_users_repo from "../padel/users_repo.js";
import type * as padel_validators from "../padel/validators.js";
import type * as push_actions from "../push_actions.js";
import type * as tournaments from "../tournaments.js";
import type * as tournaments_authz from "../tournaments/authz.js";
import type * as tournaments_repo from "../tournaments/repo.js";
import type * as tournaments_slugs from "../tournaments/slugs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  padel: typeof padel;
  "padel/auth": typeof padel_auth;
  "padel/constants": typeof padel_constants;
  "padel/date_time": typeof padel_date_time;
  "padel/events": typeof padel_events;
  "padel/handlers_matches": typeof padel_handlers_matches;
  "padel/handlers_notifications": typeof padel_handlers_notifications;
  "padel/handlers_push": typeof padel_handlers_push;
  "padel/handlers_users": typeof padel_handlers_users;
  "padel/match_view": typeof padel_match_view;
  "padel/matches_repo": typeof padel_matches_repo;
  "padel/notifications_service": typeof padel_notifications_service;
  "padel/push_message": typeof padel_push_message;
  "padel/types": typeof padel_types;
  "padel/users_repo": typeof padel_users_repo;
  "padel/validators": typeof padel_validators;
  push_actions: typeof push_actions;
  tournaments: typeof tournaments;
  "tournaments/authz": typeof tournaments_authz;
  "tournaments/repo": typeof tournaments_repo;
  "tournaments/slugs": typeof tournaments_slugs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
