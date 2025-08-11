import "dotenv/config";
import { http, num, str } from "./configUtil";
import JsonLogger from "../logger";

export const CONFIG = {
    server: {
        /** The port the server runs on */
        port: num("PORT") || 3000,

        /** Authentication token */
        auth: str("AUTH_TOKEN"),
    },

    database: {
        encryption: {
            /** Whether to apply encryption by default */
            enabled: str("DATABASE_ENCRYPTION_ENABLED") === "true",
            /** Either encryption password or encryption key */
            key: str("DATABASE_ENCRYPTION_KEY"),
        },
    },

    railway: {
        /** The GraphQL endpoint for the Railway backboard */
        backboard: http("RAILWAY_BACKBOARD_URL") || `https://backboard.railway.com/graphql/v2`,

        /** Railway API token */
        apiKey: str("RAILWAY_API_KEY"),

        /** Logging related configuration */
        log: {
            /** Max data size limit for a log-chunk */
            maxChunkLength: num("RAILWAY_LOG_MAX_CHUNK_LENGTH") || 60_000,

            /** Max size limit for a log request */
            maxLogRequestSize: num("RAILWAY_LOG_MAX_REQUEST_SIZE") || 5_000,
        },

        /** Railway provided variables */
        provided: {
            /** The ID for the current deployment */
            deploymentId: str("RAILWAY_DEPLOYMENT_ID"),
            /** The ID for the current environment */
            environmentId: str("RAILWAY_ENVIRONMENT_ID"),
        }
    }
}

const logger = new JsonLogger({ origin: "Config" });
logger.info("Loaded Config", CONFIG);