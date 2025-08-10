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
    private groupAndReassembleChunks(logObjects: any[]): any[] {
        // Group by __id
        const groups = new Map<string, any[]>();
        for (const obj of logObjects) {
            const id = obj.__id;
            if (!id) continue;

            if (!groups.has(id)) groups.set(id, []);
            groups.get(id)!.push(obj);
        }

        // Reassemble each group
        const reassembled: any[] = [];
        for (const [id, chunks] of groups) {
            const firstChunk = chunks[0];
            const hasChunkInfo = typeof firstChunk.total === 'number' && typeof firstChunk.index === 'number';

            if (!hasChunkInfo || firstChunk.total === 1) {
                // Single chunk or non-chunked data
                const result = { ...firstChunk };
                delete result.index;
                delete result.total;
                reassembled.push(result);
            } else {
                // Multi-chunk data -> reassemble
                const originalData = this.reassembleChunks(chunks);
                const result = {
                    __id: id,
                    data: originalData,
                    operation: firstChunk.operation
                };
                reassembled.push(result);
            }
        }

        return reassembled;
    }

    /** Fetches additional chunks if needed for incomplete records */
    private async fetchMissingChunks(logObjects: any[]): Promise<any[]> {
        const allChunks: any[] = [...logObjects];
        const incompleteGroups = new Map<string, { chunks: any[], expectedTotal: number }>();

        // Group by __id
        const groups = new Map<string, (Chunk & { operation: string })[]>();
        for (const obj of logObjects) {
            const id = obj.__id;
            if (!id) continue;

            if (!groups.has(id)) groups.set(id, []);
            groups.get(id)!.push({ ...obj, operation: obj.operation });
        }

        // Identify incomplete groups
        for (const [id, chunks] of groups) {
            const firstChunk = chunks[0];
            const expectedTotal = firstChunk.total;

            if (typeof expectedTotal === 'number' && expectedTotal > 1 && chunks.length < expectedTotal) {
                incompleteGroups.set(id, { chunks, expectedTotal });
            }
        }

        // Fetch missing chunks
        for (const [id, { chunks, expectedTotal }] of incompleteGroups) {
            const firstChunk = chunks[0];

            try {
                const additionalResult = await this.api.logs.read({
                    deploymentId: CONFIG.railway.provided.deploymentId!,
                    limit: expectedTotal * 2,
                    filter: `@__id:"${id}" AND @operation:"${firstChunk.operation}"`,
                });

                if (additionalResult?.deploymentLogs) {
                    const additionalLogs = additionalResult.deploymentLogs.map(log => this.logToData(log));

                    // Add any chunks we don't already have
                    const existingIndices = new Set(chunks.map(c => c.index));
                    for (const log of additionalLogs) {
                        const logObj = log as any;
                        if (logObj.__id === id && !existingIndices.has(logObj.index)) allChunks.push(logObj);
                    }
                }
            } catch (error) {
                this.logger.warn(`Failed to fetch additional chunks for ID ${id}:`, { error: (error as any).message });
            }
        }

        return allChunks;
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

        // I super don't like doing it this way
        // BUT when I consider speed vs redundancy, I think this is probably the better solution
        // The alternative is requesting the limit, and then from there requesting more chunks based on total
        // Doing it this way however means there is a possibility of fetching all chunks straight from the get-go
        const requestedLimit = params.limit || 1;
        const internalLimit = Math.max(requestedLimit * 10, CONFIG.railway.log.maxLogRequestSize);

        const result = await this.api.logs.read({
            deploymentId: CONFIG.railway.provided.deploymentId,
            limit: internalLimit,
            filter,
        });

        if (!result || !result.deploymentLogs) {
            const message = !result ? "No result returned from read API query" : "No deployment logs attached to read API query result";
            throw new Error(message);
        }

        const logs = result.deploymentLogs;
        if (!logs || logs.length === 0) return undefined;

        // Convert logs to data objects
        let logObjects = logs.map(log => this.logToData(log)) as any[];
        logObjects = await this.fetchMissingChunks(logObjects);

        const reassembledRecords = this.groupAndReassembleChunks(logObjects);
        const limitedResults = reassembledRecords.slice(0, requestedLimit);

        return requestedLimit === 1 ? limitedResults[0] : limitedResults;
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