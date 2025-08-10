import { LogOperation, operation } from ".";
import { CONFIG } from "../config";
import JsonLogger from "../logger";
import { DeploymentLogAttributes, Railway, RailwayConfig, DeploymentLog } from "../clients/railway";

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

        const result = await this.api.logs.read({
            deploymentId: CONFIG.railway.provided.deploymentId,
            filter,
            limit: params.limit || 1
        });

        console.debug("GQL Read:", { result, filter });

        if (!result.deploymentLogs) {
            const message = "Malformed result from Railway";
            this.logger.error("dataSearch", { params, error: message });
            throw new Error(message);
        }

        const logs = result.deploymentLogs;
        if (!logs || logs.length === 0) return undefined;

        // Convert logs to data objects
        const results = logs.map(log => this.logToData(log));
        return params.limit === 1 ? results[0] : results;
    }

    async dataFromId(id: string) {
        return this.dataSearch({
            id,
            exclude: { operation: "read" },
            limit: 1
        });
    }
}

export default RailwayUtil;