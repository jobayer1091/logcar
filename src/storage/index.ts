import JsonLogger from "../logger";
import { randomUUID } from "crypto";
import { Railway } from "../railway";
import { CONFIG } from "../config";

const operation = {
    create: "create",
    read: "read",
    update: "update",
    delete: "delete"
}

type LogConfig = {
    railwayAuth: string;

}

export class Log {
    logger: JsonLogger;
    railwayAuth: string;
    railway: Railway;

    constructor(config: LogConfig) {
        this.logger = new JsonLogger();
        this.railwayAuth = config.railwayAuth;
        this.railway = new Railway({ authorization: this.railwayAuth });
    }

    create<T = object>(data: T): { data: T; __id: string } {
        const collection = { data, __id: randomUUID() };
        this.logger.info(operation.create, { ...collection, operation: operation.create });
        return collection;
    }

    async read(id: string) {
        if (!CONFIG.railway.provided.deploymentId) {
            this.logger.error(operation.read, { __id: id, error: "No Railway deployment ID provided" });
            throw new Error("No Railway deployment ID provided");
        }

        this.logger.info(operation.read, { __id: id, operation: operation.read });

        try {
            const filter: string = `@__id:\\"${id}\\" AND -@operation:\\"${operation.read}\\" AND @level:\\"info\\"`;
            const result = await this.railway.api.logs.read({
                deploymentId: CONFIG.railway.provided.deploymentId,
                filter,
                limit: 1
            });

            console.debug("GQL Read:", { result, filter });

            if (!result.deploymentLogs) {
                const message = "Malformed result from Railway";
                this.logger.error(operation.read, { __id: id, error: message });
                throw new Error(message);
            }

            const lastLog = result.deploymentLogs[0];
            if (!lastLog) return undefined;
            if ("operation" in lastLog.attributes && lastLog.attributes.operation === operation.delete) return undefined;

            return lastLog.attributes;
        } catch (error) {
            const message = (error as any).message || "Unknown error";
            this.logger.error(operation.read, { __id: id, error: message });
            throw new Error(message);
        }
    }

    update<T = object>(data: T & { __id: string }): T & { __id: string };
    update<T = object>(id: string, data: T): { __id: string; data: T };
    update<T = object>(idOrData: string | T, data?: T) {
        const collection = { __id: idOrData, data };
        this.logger.info(operation.update, { ...collection, operation: operation.update });
        return collection;
    }

    delete(id: string) {
        this.logger.info(operation.delete, { __id: id, operation: operation.delete });
    }
}