import "dotenv/config";

export const CONFIG = {
    server: {
        /** The port the server runs on */
        port: process.env.PORT || 3000
    },
    railway: {
        /** The GraphQL endpoint for the Railway backboard */
        backboard: process.env.RAILWAY_BACKBOARD_URL || `https://backboard.railway.com/graphql/v2`,

        /** Railway provided variables */
        provided: {
            /** The ID for the current deployment */
            deploymentId: process.env.RAILWAY_DEPLOYMENT_ID,
        }
    }
}