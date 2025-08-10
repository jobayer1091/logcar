import { LogOperation, operation } from ".";
import { CONFIG } from "../config";
import JsonLogger from "../logger";
import { EnvironmentLogAttributes, Railway, RailwayConfig, EnvironmentLog } from "../clients/railway";
import { Chunk, reassembleChunks } from "./chunkUtil";

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

    /** Converts log objects to proper Chunk format and reassembles them */
    private reassembleLogChunks(logChunks: any[]): any {
        const chunks: Chunk[] = logChunks.map(logObj => ({
            data: (() => {
                // this cleanup method makes me sick
                // in hindsight i shouldn't have stored data along with metadata lol
                const cleanChunk = { ...logObj };
                delete cleanChunk.__id;
                delete cleanChunk.__operation;
                delete cleanChunk.__index;
                delete cleanChunk.__total;
                return cleanChunk;
            })(),
            index: logObj.__index,
            total: logObj.__total
        }));

        return reassembleChunks(chunks);
    }

    /** Groups chunks by their __id and reassembles them */
    private async processLogObjects(logObjects: any[]): Promise<any[]> {
        const processedRecords: any[] = [];

        for (const logObj of logObjects) {
            // Check if this is a chunked record that needs reassembly
            if (logObj.__total && logObj.__total > 1) {
                // This is a multi-chunk record, fetch all chunks
                const allChunks = await this.fetchAllChunksForRecord(logObj.__id, logObj.__operation, logObj.__total);

                if (allChunks.length === logObj.__total) {
                    // We got all chunks, reassemble
                    const reassembledData = this.reassembleLogChunks(allChunks);
                    processedRecords.push({
                        __id: logObj.__id,
                        data: reassembledData,
                        operation: logObj.__operation
                    });
                } else {
                    // Missing some chunks, log warning but include what we have
                    this.logger.warn(`Incomplete chunked record for ID ${logObj.__id}. Expected ${logObj.__total}, got ${allChunks.length}`);
                    const partialData = this.reassembleLogChunks(allChunks);
                    processedRecords.push({
                        __id: logObj.__id,
                        data: partialData,
                        operation: logObj.__operation,
                        _incomplete: true
                    });
                }
            } else {
                // Single chunk or regular data
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

        this.logger.info(`Processed ${processedRecords.length} records for ID ${logObjects[0]?.id}`, { processedRecords });

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