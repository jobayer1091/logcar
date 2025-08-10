import { LogOperation, operation } from ".";
import { CONFIG } from "../config";
import JsonLogger from "../logger";
import { DeploymentLogAttributes, Railway, RailwayConfig, DeploymentLog } from "../clients/railway";
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
    fetchValueFromAttributes(attributes: DeploymentLogAttributes[], key: string): string | undefined {
        const attribute = attributes.find(attr => attr.key === key);
        if (attribute) return attribute.value;
        else return undefined;
    }

    /** Converts a DeploymentLog to a data object */
    logToData(log: DeploymentLog): object {
        const idAttr = this.fetchValueFromAttributes(log.attributes, "__id");
        const dataAttr = this.fetchValueFromAttributes(log.attributes, "data");
        const operationAttr = this.fetchValueFromAttributes(log.attributes, "operation");

        const parsedDataAttr = dataAttr ? JSON.parse(dataAttr) : undefined;
        const dataObject = { ...parsedDataAttr };

        if (idAttr) dataObject.__id = idAttr;
        if (operationAttr) dataObject.operation = JSON.parse(operationAttr);

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
    private reassembleChunks(chunks: Chunk[]): any {
        if (chunks.length === 0) return undefined;
        if (chunks.length === 1) return chunks[0].data;

        const sortedChunks = chunks.sort((a, b) => (a.index || 0) - (b.index || 0));

        const firstChunk = sortedChunks[0];
        const firstData = firstChunk.data;

        // Handle string: simply join
        if (typeof firstData === 'string') {
            return sortedChunks.map(chunk => chunk.data).join('');
        }

        // Handle array: flatten and combine
        if (Array.isArray(firstData)) {
            const result: any[] = [];
            for (const chunk of sortedChunks) {
                if (Array.isArray(chunk.data)) result.push(...chunk.data);
            }
            return result;
        }

        // Handle object: merge
        if (typeof firstData === 'object' && firstData !== null) {
            const result: Record<string, any> = {};
            for (const chunk of sortedChunks) {
                if (typeof chunk.data === 'object' && chunk.data !== null) Object.assign(result, chunk.data);
            }
            return result;
        }

        // Handle fallback
        return sortedChunks.map(chunk => String(chunk.data)).join('');
    }

    /** Groups chunks by their __id and reassembles them */
    private async processLogObjects(logObjects: any[]): Promise<any[]> {
        const processedRecords: any[] = [];

        for (const logObj of logObjects) {
            this.logger.info(`Processing log object for ID ${logObj.__id}`, { logObj });

            // Check if this is a chunked record that needs reassembly
            if (typeof logObj.total === 'number' && logObj.total > 1) {
                // This is a multi-chunk record, fetch all chunks
                const allChunks = await this.fetchAllChunksForRecord(
                    logObj.__id,
                    logObj.operation,
                    logObj.total
                );

                if (allChunks.length === logObj.total) {
                    // We got all chunks, reassemble
                    this.logger.info(`Reassembling ${logObj.total} chunks for ID ${logObj.__id}`, { chunks: allChunks });
                    const reassembledData = this.reassembleChunks(allChunks);
                    processedRecords.push({
                        __id: logObj.__id,
                        data: reassembledData,
                        operation: logObj.operation
                    });
                } else {
                    // Missing some chunks, log warning but include what we have
                    this.logger.warn(`Incomplete chunked record for ID ${logObj.__id}. Expected ${logObj.total}, got ${allChunks.length}`);
                    const partialData = this.reassembleChunks(allChunks);
                    processedRecords.push({
                        __id: logObj.__id,
                        data: partialData,
                        operation: logObj.operation,
                        _incomplete: true
                    });
                }
            } else {
                // Single chunk or regular data
                const result = { ...logObj };
                delete result.index;
                delete result.total;
                processedRecords.push(result);
            }
        }

        return processedRecords;
    }

    /** Fetches all chunks for a specific record that needs reassembly */
    private async fetchAllChunksForRecord(id: string, operation: string, expectedTotal: number): Promise<any[]> {
        try {
            const result = await this.api.logs.read({
                deploymentId: CONFIG.railway.provided.deploymentId!,
                limit: expectedTotal, // Request exactly the number of chunks we need
                filter: `@__id:"${id}" AND @operation:"${operation}"`,
            });

            if (result?.deploymentLogs) return result.deploymentLogs.map(log => this.logToData(log));
            else this.logger.warn(`No additional chunks found for ID ${id} with operation ${operation}`);
        } catch (error) {
            this.logger.warn(`Failed to fetch chunks for ID ${id}:`, { error: (error as any).message });
        }

        return [];
    }

    /** Searches for logs based on the provided parameters */
    async dataSearch(params: SearchParameters) {
        if (!CONFIG.railway.provided.deploymentId) throw new Error("Missing deploymentId");

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

        const result = await this.api.logs.read({
            deploymentId: CONFIG.railway.provided.deploymentId,
            limit,
            filter,
        });

        if (!result || !result.deploymentLogs) {
            const message = !result ? "No result returned from read API query" : "No deployment logs attached to read API query result";
            throw new Error(message);
        }

        const logs = result.deploymentLogs;
        if (!logs || logs.length === 0) return undefined;

        // Convert logs to data objects
        const logObjects = logs.map(log => this.logToData(log)) as any[];
        const processedRecords = await this.processLogObjects(logObjects);

        return limit === 1 ? processedRecords[0] : processedRecords;
    }

    async dataFromId(id: string) {
        const result = await this.dataSearch({
            id,
            exclude: { operation: "read" },
            limit: 1
        });

        if (result && typeof result === 'object' && 'data' in result) return result.data;
        return result;
    }
}

export default RailwayUtil;