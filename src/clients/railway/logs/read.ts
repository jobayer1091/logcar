import { RailwayGQL } from "../common"

/** Variables for the GetDeploymentLogs GraphQL query. */
export interface GetDeploymentLogsVariables {
  /** The ID of the deployment to fetch logs for. */
  deploymentId: string;
  /** Optional filter string for log messages. */
  filter?: string;
  /** Optional limit for the number of logs returned. */
  limit?: number;
  /** Optional start date (ISO string) for filtering logs. */
  startDate?: string;
  /** Optional end date (ISO string) for filtering logs. */
  endDate?: string;
}

/** Key-value pair attributes for a deployment log. */
export interface DeploymentLogAttributes {
  key: string;
  value: string;
}

/** Tags associated with a deployment log. */
export interface DeploymentLogTags {
  deploymentId: string;
  deploymentInstanceId: string;
  environmentId: string;
  pluginId: string;
  projectId: string;
  serviceId: string;
  snapshotId: string;
}

/** Represents a single deployment log entry. */
export interface DeploymentLog {
  /** Array of key-value attributes. */
  attributes: DeploymentLogAttributes[];
  /** Log message content. */
  message: string;
  /** Severity level of the log. */
  severity: string;
  /** Tags providing context for the log. */
  tags: DeploymentLogTags;
  /** Timestamp of the log entry (ISO string). */
  timestamp: string;
}

/** Response type for the GetDeploymentLogs GraphQL query. */
export interface GetDeploymentLogsResponse {
  /** Array of deployment log entries. */
  deploymentLogs: DeploymentLog[];
}

const query = new RailwayGQL<GetDeploymentLogsVariables, GetDeploymentLogsResponse>(`query GetDeploymentLogs($deploymentId: String!, $filter: String, $limit: Int, $startDate: DateTime, $endDate: DateTime) {
  deploymentLogs(deploymentId: $deploymentId, endDate: $endDate, startDate: $startDate, limit: $limit, filter: $filter) {
    attributes {
        key,
        value
    },
    message,
    severity,
    tags {
        deploymentId
        deploymentInstanceId,
        environmentId,
        pluginId,
        projectId,
        serviceId,
        snapshotId
    },
    timestamp
  }
}`);

export default query;