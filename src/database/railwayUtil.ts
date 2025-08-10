import { LogOperation, operation } from ".";
import { CONFIG } from "../config";
import JsonLogger from "../logger";
import { EnvironmentLogAttributes, Railway, RailwayConfig, EnvironmentLog } from "../clients/railway";
import { Chunk } from "./chunkUtil";

/** Configuration for search parameters */
type SearchParameterConfig = {
    /** The limit of the data returned */
    limit?: number;
    /** The filter string to apply to the search (Railway log filter syntax) */
    filter?: string;
}

/** A set of search parameters */
type SearchParameterSet = {
    /** The specific log id to search for */
    id?: string;
    /** The attributes to search for (e.g., {"data.foo": "bar"} becomes @data.foo:"bar") */
    attributes?: Record<string, string>;
    /** The operation type to search for */
    operation?: LogOperation;
}

/** The search parameters */
type SearchParameters = SearchParameterSet & SearchParameterConfig & {
    /** The search parameters to exclude */
    exclude?: SearchParameters
};

/** Superset of Railway with utility functionality specific towards the storage functionality */
export class RailwayUtil extends Railway {
    logger: JsonLogger;

    constructor(config: RailwayConfig) {
        super(config);

        this.logger = new JsonLogger({ origin: "LogRail" });
    }

    /** Given a list of log attributes, find and return the value for a specific key */
    fetchValueFromAttributes(attributes: EnvironmentLogAttributes[], key: string): string | undefined {
        const attribute = attributes.find(attr => attr.key === key);
        if (attribute) return attribute.value;
        else return undefined;
    }

    /** Converts a EnvironmentLog to a data object */
    logToData(log: EnvironmentLog): object {
        const fromAttr = (str: string) => this.fetchValueFromAttributes(log.attributes, str);

        const idAttr = fromAttr("__id");
        const dataAttr = fromAttr("data");
        const operationAttr = fromAttr("operation");
        const indexAttr = fromAttr("index");
        const totalAttr = fromAttr("total");

        const parsedDataAttr = dataAttr ? JSON.parse(dataAttr) : undefined;
        const dataObject = { ...parsedDataAttr };

        if (idAttr) dataObject.__id = JSON.parse(idAttr);
        if (operationAttr) dataObject.__operation = JSON.parse(operationAttr);
        if (indexAttr) dataObject.__index = JSON.parse(indexAttr);
        if (totalAttr) dataObject.__total = JSON.parse(totalAttr);

        return dataObject;
    }

    /** Builds a filter string from search parameters */
    private buildFilter(params: SearchParameterSet, exclude: boolean = false): string[] {
        const conditions: string[] = [];
        const prefix = exclude ? "-" : "";

        if (params.id) conditions.push(`${prefix}@__id:"${params.id}"`);
        if (params.operation) conditions.push(`${prefix}@operation:"${params.operation}"`);

        if (params.attributes) {
            for (const [key, value] of Object.entries(params.attributes)) {
                conditions.push(`${prefix}@${key}:"${value}"`);
            }
        }

        return conditions;
    }

    /** Reassembles chunks back into original data */
    private reassembleChunks(chunks: any[]): any {
        if (chunks.length === 0) return undefined;
        if (chunks.length === 1) {
            // Single chunk - return the data part (excluding metadata)
            const chunk = { ...chunks[0] };
            delete chunk.__id;
            delete chunk.__operation;
            delete chunk.__index;
            delete chunk.__total;
            return chunk;
        }

        // Sort chunks by __index to ensure correct order
        const sortedChunks = chunks.sort((a, b) => (a.__index || 0) - (b.__index || 0));

        // Extract data from first chunk to determine type
        const firstChunk = { ...sortedChunks[0] };
        delete firstChunk.__id;
        delete firstChunk.__operation;
        delete firstChunk.__index;
        delete firstChunk.__total;

        // Handle string: simply join
        if (typeof firstChunk === 'object' && firstChunk !== null) {
            // Check if it looks like a string chunk (single property with string value)
            const keys = Object.keys(firstChunk);
            if (keys.length === 1 && typeof firstChunk[keys[0]] === 'string') {
                return sortedChunks.map(chunk => {
                    const cleanChunk = { ...chunk };
                    delete cleanChunk.__id;
                    delete cleanChunk.__operation;
                    delete cleanChunk.__index;
                    delete cleanChunk.__total;
                    return cleanChunk[keys[0]];
                }).join('');
            }
        }

        // Handle array: flatten and combine
        if (Array.isArray(firstChunk)) {
            const result: any[] = [];
            for (const chunk of sortedChunks) {
                const cleanChunk = { ...chunk };
                delete cleanChunk.__id;
                delete cleanChunk.__operation;
                delete cleanChunk.__index;
                delete cleanChunk.__total;
                if (Array.isArray(cleanChunk)) result.push(...cleanChunk);
            }
            return result;
        }

        // Handle object: merge
        if (typeof firstChunk === 'object' && firstChunk !== null) {
            const result: Record<string, any> = {};
            for (const chunk of sortedChunks) {
                const cleanChunk = { ...chunk };
                delete cleanChunk.__id;
                delete cleanChunk.__operation;
                delete cleanChunk.__index;
                delete cleanChunk.__total;
                if (typeof cleanChunk === 'object' && cleanChunk !== null) {
                    Object.assign(result, cleanChunk);
                }
            }
            return result;
        }

        // Handle fallback - treat as strings
        return sortedChunks.map(chunk => {
            const cleanChunk = { ...chunk };
            delete cleanChunk.__id;
            delete cleanChunk.__operation;
            delete cleanChunk.__index;
            delete cleanChunk.__total;
            return String(cleanChunk);
        }).join('');
    }

    /** Groups chunks by their __id and reassembles them */
    private async processLogObjects(logObjects: any[]): Promise<any[]> {
        const processedRecords: any[] = [];

        for (const logObj of logObjects) {
            this.logger.info(`Processing log object for ID ${logObj.__id}`, {
                logObj,
                hasTotal: logObj.__total,
                totalValue: logObj.__total,
                hasIndex: logObj.__index,
                indexValue: logObj.__index
            });

            // Check if this is a chunked record that needs reassembly
            if (logObj.__total && logObj.__total > 1) {
                // This is a multi-chunk record, fetch all chunks
                const allChunks = await this.fetchAllChunksForRecord(logObj.__id, logObj.__operation, logObj.__total);

                this.logger.info(`Got ${allChunks.length} chunks for ID ${logObj.__id}`, {
                    expected: logObj.__total,
                    received: allChunks.length,
                    chunks: allChunks.map(c => ({ id: c.__id, index: c.__index, total: c.__total }))
                });

                if (allChunks.length === logObj.__total) {
                    // We got all chunks, reassemble
                    this.logger.info(`Reassembling ${logObj.__total} chunks for ID ${logObj.__id}`);
                    const reassembledData = this.reassembleChunks(allChunks);
                    this.logger.info(`Reassembled data for ID ${logObj.__id}`, { reassembledData });
                    processedRecords.push({
                        __id: logObj.__id,
                        data: reassembledData,
                        operation: logObj.__operation
                    });
                } else {
                    // Missing some chunks, log warning but include what we have
                    this.logger.warn(`Incomplete chunked record for ID ${logObj.__id}. Expected ${logObj.__total}, got ${allChunks.length}`);
                    const partialData = this.reassembleChunks(allChunks);
                    processedRecords.push({
                        __id: logObj.__id,
                        data: partialData,
                        operation: logObj.__operation,
                        _incomplete: true
                    });
                }
            } else {
                // Single chunk or regular data
                this.logger.info(`Single chunk data for ID ${logObj.__id}`, { logObj });
                const result = { ...logObj };
                delete result.__index;
                delete result.__total;
                processedRecords.push(result);
            }
        }

        return processedRecords;
    }

    /** Fetches all chunks for a specific record that needs reassembly */
    private async fetchAllChunksForRecord(id: string, operation: string, limit: number): Promise<any[]> {
        try {
            const filter = `@__id:"${id}" AND @operation:"${operation}"`;

            const result = await this.api.logs.environmentLogs({
                environmentId: CONFIG.railway.provided.environmentId!,
                filter,
                afterDate: new Date().toISOString(),
                afterLimit: limit,
            });

            this.logger.info(`Fetching all chunks for ID ${id} with operation ${operation}`, { limit, result, filter });

            if (result?.environmentLogs) return result.environmentLogs.map(log => this.logToData(log));
            else this.logger.warn(`No additional chunks found for ID ${id} with operation ${operation}`);
        } catch (error) {
            this.logger.warn(`Failed to fetch chunks for ID ${id}:`, { error: (error as any).message });
        }

        return [];
    }

    /** Searches for logs based on the provided parameters */
    async dataSearch(params: SearchParameters) {
        if (!CONFIG.railway.provided.environmentId) throw new Error("Missing environmentId");

        // Build filter from parameters
        const includeConditions = this.buildFilter(params);
        const excludeConditions = params.exclude ? this.buildFilter(params.exclude, true) : [];

        let filter = params.filter || "";

        // Combine all conditions
        const allConditions = [...includeConditions, ...excludeConditions];
        if (allConditions.length > 0) {
            const conditionString = allConditions.join(" AND ");
            filter = filter ? `${filter} AND ${conditionString}` : conditionString;
        }

        const limit = params.limit || 1;

        const result = await this.api.logs.environmentLogs({
            environmentId: CONFIG.railway.provided.environmentId,
            filter,
            afterDate: new Date().toISOString(),
            afterLimit: limit,
        });

        if (!result || !result.environmentLogs) {
            const message = !result ? "No result returned from environmentLogs API query" : "No environment logs attached to environmentLogs API query result";
            throw new Error(message);
        }

        const logs = result.environmentLogs;
        if (!logs || logs.length === 0) return undefined;

        // Convert logs to data objects
        const logObjects = logs.slice(0, limit).map(log => this.logToData(log)) as any[];
        const processedRecords = await this.processLogObjects(logObjects);

        return limit === 1 ? processedRecords[0] : processedRecords;
    }

    async dataFromId(id: string) {
        const result = await this.dataSearch({
            id,
            exclude: { operation: "read" },
            limit: 1
        });

        return result;
    }
}

export default RailwayUtil;