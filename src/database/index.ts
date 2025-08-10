import JsonLogger from "../logger";
import { randomUUID } from "crypto";
import { CONFIG } from "../config";
import RailwayUtil from "./railwayUtil";

export const operation = {
    create: "create",
    read: "read",
    update: "update",
    delete: "delete"
}

export type LogOperation = keyof typeof operation;

type LogConfig = {
    railwayAuth: string;
}

/** Manages logging to and fetching logs from Railway */
export class LogRail {
    logger: JsonLogger;
    railwayAuth: string;
    railUtil: RailwayUtil;

    constructor(config: LogConfig) {
        this.logger = new JsonLogger({ origin: "LogRail" });
        this.railwayAuth = config.railwayAuth;
        this.railUtil = new RailwayUtil({ authorization: this.railwayAuth });
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
            const data = await this.railUtil.dataFromId(id);
            if (data) return data;
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