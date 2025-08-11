import JsonLogger from "../logger";
import { randomUUID } from "crypto";
import { CONFIG } from "../config";
import RailwayUtil from "./railwayUtil";
import { extractLogChunks } from "./chunkUtil";

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
        // Use the new flattening approach for individual logging
        const logChunks = extractLogChunks(data, CONFIG.railway.log.maxChunkLength);

        const __id = randomUUID();
        for (const chunk of logChunks) {
            this.logger.info(operation.create, {
                data: chunk.data,
                chunkId: chunk.chunkId,
                index: chunk.index,
                total: chunk.total,
                __id,
                operation: operation.create
            });
        }

        return { data, __id };
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
    update<T = object>(idOrData: string | (T & { __id: string }), data?: T) {
        let actualId: string;
        let actualData: T;

        if (typeof idOrData === 'string') {
            // Called as update(id, data)
            actualId = idOrData;
            actualData = data!;
        } else {
            // Called as update(data) where data has __id
            actualId = idOrData.__id;
            const { __id, ...restData } = idOrData;
            actualData = restData as T;
        }

        const logChunks = extractLogChunks(actualData, CONFIG.railway.log.maxChunkLength);

        for (const chunk of logChunks) {
            this.logger.info(operation.update, {
                data: chunk.data,
                chunkId: chunk.chunkId,
                index: chunk.index,
                total: chunk.total,
                __id: actualId,
                operation: operation.update
            });
        }

        return typeof idOrData === 'string' ? { __id: actualId, data: actualData } : idOrData;
    }

    delete(id: string) {
        this.logger.info(operation.delete, { __id: id, operation: operation.delete });
    }
}