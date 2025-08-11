# LogCar

A Railway-native database in the truest sense. LogCar uses Railway's logs as a storage medium, allowing for efficient and very native event logging and retrieval.

# Documentation

## API Endpoints

LogCar provides a RESTful API for CRUD operations on data stored in Railway logs.

### Authentication

All endpoints may require:

- **Authorization Header**: Bearer token for authentication (unless authentication is not set)
- **Railway API Key**: Provided via query parameter `railwayApiKey` or configured globally (unless database has a default railway api key set)

### Common Query Parameters

- `railwayApiKey` (string): Railway API key for accessing logs
- `encryptionToken` (string, optional): Token for encrypting/decrypting data - either password or encryption key

### Endpoints

#### POST `/create`

Creates new data entries in Railway logs. Supports both JSON data and file uploads via multi-part form.

**Request:**

- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `railwayApiKey` (required if not configured globally)
  - `encryptionToken` (optional)
- **Body**: JSON data to store, or multipart form data for file uploads
- **Files**: Support for file uploads via multipart form data

**Response:**

```json
["id1", "id2", "..."]
```

#### GET `/read`

Retrieves data by ID from Railway logs.

**Request:**

- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `id` (required): ID of the data to retrieve
  - `railwayApiKey` (required if not configured globally)
  - `encryptionToken` (optional): Required if data was encrypted
  - `raw` (optional): Set to "true" or "1" to return raw data without metadata
  - `text` (optional): Set to "true" or "1" to return as plain text

**Response:**

- For regular data: JSON object with data and metadata
- For files: File download
- For raw data: Just the data without wrapper

#### PUT `/update`

Updates existing data by ID.

**Request:**

- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `id` (required): ID of the data to update
  - `railwayApiKey` (required if not configured globally)
  - `encryptionToken` (optional)
- **Body**: JSON data to store, or multipart form data for file uploads

**Response:**

```json
["id"]
```

#### DELETE `/delete`

Deletes data by ID from Railway logs.

**Request:**

- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `id` (required): ID of the data to delete
  - `railwayApiKey` (required if not configured globally)

**Response:**

```json
{
	"success": true
}
```

### Error Responses

All endpoints return appropriate HTTP status codes:

- **401 Unauthorized**: Missing or invalid authorization token
- **400 Bad Request**: Missing required parameters or invalid request
- **500 Internal Server Error**: Server-side errors during processing

Error response format:

```json
{
	"error": "Error description"
}
```

### File Upload Support

The `/create` endpoint supports file uploads with the following features:

- **Compression**: Files are automatically compressed using gzip
- **Metadata**: Original filename, content type, and size are preserved
- **Base64 Encoding**: File data is base64 encoded for storage
- **Download Support**: Files can be downloaded with proper headers via `/read` endpoint

### Encryption

LogCar supports optional encryption for sensitive data:

- Provide `encryptionToken` query parameter when creating/updating data
- Same token required when reading encrypted data
- Encryption is applied to the data payload before storage
- Server can specify default encryption settings

### Configuration

LogCar uses environment variables for configuration.

#### Environment Variables

##### Server Configuration

- **`PORT`** (number, optional)
  - Default: `3000`
  - The port the LogCar server runs on

- **`AUTH_TOKEN`** (string, optional)
  - Authentication token required for API access
  - If not set, authentication is disabled

##### Database Configuration

- **`DATABASE_ENCRYPTION_ENABLED`** (boolean, optional)
  - Default: `false`
  - Set to `"true"` to enable encryption by default for all data

- **`DATABASE_ENCRYPTION_KEY`** (string, optional)
  - Default encryption key or password for database operations
  - Used when no `encryptionToken` is provided in requests

##### Railway Configuration

- **`RAILWAY_BACKBOARD_URL`** (URL, optional)
  - Default: `https://backboard.railway.com/graphql/v2`
  - The GraphQL endpoint for Railway's backboard API

- **`RAILWAY_API_KEY`** (string, optional)
  - Railway API token for accessing Railway services
  - Can be overridden per request with `railwayApiKey` query parameter

- **`RAILWAY_LOG_MAX_CHUNK_LENGTH`** (number, optional)
  - Default: `60000`
  - Maximum data size limit for a single log chunk in bytes

- **`RAILWAY_LOG_MAX_REQUEST_SIZE`** (number, optional)
  - Default: `5000`
  - Maximum size limit for a single log request in bytes

##### Railway Provided Variables

These are automatically provided by Railway when deployed:

- **`RAILWAY_DEPLOYMENT_ID`** (string)
  - The ID for the current Railway deployment

- **`RAILWAY_ENVIRONMENT_ID`** (string)
  - The ID for the current Railway environment

#### Configuration Loading

LogCar uses utility functions to load and validate environment variables:

- **`str(env)`**: Loads a string environment variable
- **`num(env)`**: Loads a numeric environment variable (converts strings to numbers)
- **`http(env)`**: Loads and validates URL environment variables

#### Configuration Priority

1. Environment variables take precedence
2. Query parameters (like `railwayApiKey`) override global config for individual requests
3. Default values are used when no configuration is provided