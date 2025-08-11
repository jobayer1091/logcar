import JsonLogger from "../logger";
import { randomUUID } from "crypto";
import { CONFIG } from "../config";
import RailwayUtil from "./railwayUtil";
import { extractLogChunks } from "./chunkUtil";
import { DataEncryption } from "./encryption";

export const operation = {
    create: "create",
    read: "read",
    update: "update",
    delete: "delete"
}

export type LogOperation = keyof typeof operation;

type LogConfig = {
    railwayAuth: string;
    /** Whether to apply encryption by default */
    encryption?: boolean;
}

type OperationConfig = {
    /** Either encryption key or password */
    encryptionToken?: string;
}

/** Manages logging to and fetching logs from Railway */
export class LogRail {
    logger: JsonLogger;
    railwayAuth: string;
    railUtil: RailwayUtil;
    encryption: DataEncryption;
    config: LogConfig;

    constructor(config: LogConfig) {
        this.config = config;
        this.logger = new JsonLogger({ origin: "LogRail" });
        this.railwayAuth = config.railwayAuth;
        this.railUtil = new RailwayUtil({ authorization: this.railwayAuth });
        this.encryption = new DataEncryption({ enabled: true, globalKey: CONFIG.database.encryption.key });
    }

    create<T = object>(data: T, config: OperationConfig = {}): { data: T; __id: string } {
        const shouldEncrypt = this.config.encryption || typeof config.encryptionToken === "string";
        const storeData = shouldEncrypt ? this.encryption.encrypt(data, config.encryptionToken) : data;

        // Log Data
        const logChunks = extractLogChunks(storeData, CONFIG.railway.log.maxChunkLength);

        const __id = randomUUID();
        for (const chunk of logChunks) {
            this.logger.info(operation.create, {
                data: chunk.data,
                chunkId: chunk.chunkId,
                index: chunk.index,
                total: chunk.total,
                __id,
                operation: operation.create,
                encrypted: shouldEncrypt
            });
        }

        return { data, __id };
    }

    async read<T = any>(id: string, config: OperationConfig = {}): Promise<T> {
        if (!CONFIG.railway.provided.deploymentId) {
            this.logger.error(operation.read, { __id: id, error: "No Railway deployment ID provided" });
            throw new Error("No Railway deployment ID provided");
        }

        try {
            const rawPackage = await this.railUtil.dataFromId(id);
            if (!rawPackage) return rawPackage;

            const isEncrypted = "encrypted" in rawPackage;
            if (isEncrypted && !config.encryptionToken && !CONFIG.database.encryption.key) {
                this.logger.error(operation.read, { __id: id, error: "No encryption key provided" });
                throw new Error("Attempt to read encrypted data without a decryption key");
            }

            const data = isEncrypted ? this.encryption.decrypt<T>(rawPackage.data, config.encryptionToken) : rawPackage.data;

            this.logger.info(operation.read, { __id: id, operation: operation.read });
            return { ...rawPackage, data };
        } catch (error) {
            const message = (error as any).message || "Unknown error";
            this.logger.error(operation.read, { __id: id, error: message });
            throw new Error(message);
        }
    }

    update<T = object>(data: T & { __id: string }, config?: OperationConfig): T & { __id: string };
    update<T = object>(id: string, data: T, config?: OperationConfig): { __id: string; data: T };
    update<T = object>(
        idOrData: string | (T & { __id: string }),
        dataOrConfig?: T | OperationConfig,
        config?: OperationConfig
    ) {
        let actualId: string;
        let actualData: T;
        let actualConfig: OperationConfig = {};

        if (typeof idOrData === 'string') {
            // Called as update(id, data, config)
            actualId = idOrData;
            actualData = dataOrConfig as T;
            actualConfig = config || {};
        } else {
            // Called as update(data, config) where data has __id
            actualId = idOrData.__id;
            const { __id, ...restData } = idOrData;
            actualData = restData as T;
            actualConfig = (dataOrConfig as OperationConfig) || {};
        }

        const shouldEncrypt = this.config.encryption || typeof actualConfig.encryptionToken === "string";
        const storeData = shouldEncrypt ? this.encryption.encrypt(actualData, actualConfig.encryptionToken) : actualData;

        const logChunks = extractLogChunks(storeData, CONFIG.railway.log.maxChunkLength);

        for (const chunk of logChunks) {
            this.logger.info(operation.update, {
                data: chunk.data,
                chunkId: chunk.chunkId,
                index: chunk.index,
                total: chunk.total,
                __id: actualId,
                operation: operation.update,
                encrypted: shouldEncrypt
            });
        }

        return typeof idOrData === 'string' ? { __id: actualId, data: actualData } : idOrData;
    }

    delete(id: string) {
        this.logger.info(operation.delete, { __id: id, operation: operation.delete });
    }
}