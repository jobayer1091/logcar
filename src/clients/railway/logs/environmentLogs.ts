import { RailwayGQL } from "../common"

/** Variables for the GetEnvironmentLogs GraphQL query. */
export interface GetEnvironmentLogsVariables {
    /** The ID of the environment to fetch logs for. */
    environmentId: string;
    /** Optional filter string for log messages. */
    filter?: string;
    /** Target date time to look for logs (ISO string). */
    anchorDate?: string;
    /** Latest date to look for logs after the anchor (ISO string). */
    afterDate?: string;
    /** Limit the number of logs returned after the anchor. */
    afterLimit?: number;
    /** Oldest date to look for logs before the anchor (ISO string). */
    beforeDate?: string;
    /** Limit the number of logs returned before the anchor. */
    beforeLimit?: number;
}

/** Key-value pair attributes for an environment log. */
export interface EnvironmentLogAttributes {
    key: string;
    value: string;
}

/** Tags associated with an environment log. */
export interface EnvironmentLogTags {
    deploymentId: string;
    deploymentInstanceId: string;
    environmentId: string;
    pluginId: string;
    projectId: string;
    serviceId: string;
    snapshotId: string;
}

/** Represents a single environment log entry. */
export interface EnvironmentLog {
    /** Array of key-value attributes. */
    attributes: EnvironmentLogAttributes[];
    /** Log message content. */
    message: string;
    /** Severity level of the log. */
    severity: string;
    /** Tags providing context for the log. */
    tags: EnvironmentLogTags;
    /** Timestamp of the log entry (ISO string). */
    timestamp: string;
}

/** Response type for the GetEnvironmentLogs GraphQL query. */
export interface GetEnvironmentLogsResponse {
    /** Array of environment log entries. */
    environmentLogs: EnvironmentLog[];
}

const query = new RailwayGQL<GetEnvironmentLogsVariables, GetEnvironmentLogsResponse>(`query GetEnvironmentLogs(
  $environmentId: String!,
  $filter: String,
  $anchorDate: String,
  $afterDate: String,
  $afterLimit: Int,
  $beforeDate: String,
  $beforeLimit: Int
) {
  environmentLogs(
    environmentId: $environmentId,
    filter: $filter,
    anchorDate: $anchorDate,
    afterDate: $afterDate,
    afterLimit: $afterLimit,
    beforeDate: $beforeDate,
    beforeLimit: $beforeLimit
  ) {
    attributes {
      key
      value
    }
    message
    severity
    tags {
      deploymentId
      deploymentInstanceId
      environmentId
      pluginId
      projectId
      serviceId
      snapshotId
    }
    timestamp
  }
}}`);

export default query;