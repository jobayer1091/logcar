import { createServer, IncomingMessage, ServerResponse } from "http";
import url from "url";

type ServerOptions = {

}

const method = {
    get: "get",
    post: "post",
    put: "put",
    delete: "delete"
} as const;

type Method = keyof typeof method;

type Handler = (req: RequestTransformed, res: ResponseTransformed) => any | Promise<any>;
type Handlers = { [K in Method]: Map<string, Set<Handler>> };

type ResponseTransformed = ServerResponse & {
    json: (data: any) => void;
    status: (code: number) => ResponseTransformed;
    send: (body: any) => void;
}

type FileUpload = {
    fieldName: string;
    filename: string;
    contentType: string;
    data: Buffer;
    size: number;
};

type RequestTransformed = IncomingMessage & {
    query: { [key: string]: any };
    body: { [key: string]: any };
    files: FileUpload[];
};

function transformRes(res: ServerResponse): ResponseTransformed {
    const response: ResponseTransformed = Object.assign(res, {
        json: (data: any) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
        },
        status: (code: number) => {
            res.statusCode = code;
            return response;
        },
        send: (body: any) => {
            res.setHeader("Content-Type", "text/plain");
            res.end(body);
        }
    });
    return response;
}

/** Helper function to parse multipart/form-data */
function parseMultipart(buffer: Buffer, boundary: string): { fields: { [key: string]: any }, files: FileUpload[] } {
    const fields: { [key: string]: any } = {};
    const files: FileUpload[] = [];

    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const parts: Buffer[] = [];

    let start = 0;
    let pos = buffer.indexOf(boundaryBuffer, start);

    while (pos !== -1) {
        if (start !== pos) parts.push(buffer.subarray(start, pos));
        start = pos + boundaryBuffer.length;
        pos = buffer.indexOf(boundaryBuffer, start);
    }

    // Process each part
    for (const part of parts) {
        if (part.length === 0) continue;

        const headerEndIndex = part.indexOf('\r\n\r\n');
        if (headerEndIndex === -1) continue;

        const headerSection = part.subarray(0, headerEndIndex).toString();
        const bodySection = part.subarray(headerEndIndex + 4);

        const headers: { [key: string]: string } = {};
        const headerLines = headerSection.split('\r\n');

        for (const line of headerLines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex !== -1) {
                const key = line.slice(0, colonIndex).trim().toLowerCase();
                const value = line.slice(colonIndex + 1).trim();
                headers[key] = value;
            }
        }

        const contentDisposition = headers['content-disposition'];
        if (!contentDisposition) continue;

        const nameMatch = contentDisposition.match(/name="([^"]+)"/);
        const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
        if (!nameMatch) continue;

        // Upload Properties
        const fieldName = nameMatch[1];
        const filename = filenameMatch ? filenameMatch[1] : null;
        const contentType = headers['content-type'] || 'text/plain';

        if (filename) {
            files.push({
                fieldName,
                filename,
                contentType,
                data: bodySection,
                size: bodySection.length
            });
        } else {
            fields[fieldName] = bodySection.toString();
        }
    }

    return { fields, files };
}

async function transformReq(req: IncomingMessage): Promise<RequestTransformed> {
    const query: { [key: string]: any } = {};

    // Parse query parameters
    if (req.url) {
        const decodedUrl = req.url
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")

        const urlParts = new URL(decodedUrl, `http://${req.headers.host || 'localhost'}`);
        const searchParams = urlParts.searchParams;

        for (const [key, value] of searchParams.entries()) {
            if (query[key]) {
                if (Array.isArray(query[key])) query[key].push(value);
                else query[key] = [query[key], value];
            } else {
                query[key] = value;
            }
        }
    }

    // Parse request body
    let body: { [key: string]: any } = {};
    let files: FileUpload[] = [];

    if (req.method && ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
        const chunks: Buffer[] = [];

        for await (const chunk of req) {
            chunks.push(chunk);
        }

        const rawBuffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';

        try {
            if (contentType.includes('multipart/form-data')) {
                // Extract boundary from content-type header
                const boundaryMatch = contentType.match(/boundary=([^;]+)/);
                if (boundaryMatch) {
                    const boundary = boundaryMatch[1].replace(/"/g, '');
                    const parsed = parseMultipart(rawBuffer, boundary);
                    body = parsed.fields;
                    files = parsed.files;
                }
            } else if (contentType.includes('application/json')) {
                // JSON
                const rawBody = rawBuffer.toString();
                if (rawBody) {
                    body = JSON.parse(rawBody);
                }
            } else if (contentType.includes('application/x-www-form-urlencoded')) {
                // URL-encoded
                const rawBody = rawBuffer.toString();
                if (rawBody) {
                    const params = new URLSearchParams(rawBody);
                    for (const [key, value] of params) {
                        body[key] = value;
                    }
                }
            } else {
                // RAW
                const rawBody = rawBuffer.toString();
                body = { _raw: rawBody, _rawBuffer: rawBuffer };
            }
        } catch (error) {
            // RAW fallback
            const rawBody = rawBuffer.toString();
            body = { _raw: rawBody, _rawBuffer: rawBuffer };
        }
    }

    return Object.assign(req, { query, body, files });
}

export class Server {
    private server;
    private options: ServerOptions;
    private handlers: Handlers = Object.keys(method).reduce((acc, key) => { acc[key as Method] = new Map(); return acc }, {} as Handlers);

    constructor(opt: ServerOptions = {}) {
        this.options = opt;

        const server = createServer((req, res) => {
            const { url, method } = req;

            const path = url?.split("?")[0] || "/";
            const lowercaseMethod = method?.toLowerCase();

            // Don't await here as we want the server to remain non-blocking
            this.callPathHandlers(lowercaseMethod as Method, path, req, res);
        });

        server.addListener("error", (err) => {
            console.error("Server error:", err);
        });

        this.server = server;
    }

    private async callPathHandlers(method: Method, path: string, req: IncomingMessage, res: ServerResponse) {
        const handlerMethod = this.handlers[method];
        if (!handlerMethod) {
            res.writeHead(404).end(`No handler found for ${method.toUpperCase()}`);
            return;
        }

        try {
            const transformedReq = await transformReq(req);
            const transformedRes = transformRes(res);

            const handlers = handlerMethod.get(path);
            if (handlers) {
                for (const handler of handlers) {
                    await handler(transformedReq, transformedRes);
                }
            } else {
                res.writeHead(404).end(`No handler found for ${method.toUpperCase()} ${path}`);
            }
        } catch (error) {
            console.error("Error processing request:", error);
            if (!res.headersSent) {
                res.writeHead(500).end("Internal Server Error");
            }
        }
    }

    private addHandler(method: Method, path: string, handler: Handler) {
        const handlers = this.handlers[method].get(path) || new Set();
        handlers.add(handler);
        this.handlers[method].set(path, handlers);
    }

    // METHODS

    get(path: string, handler: Handler) {
        this.addHandler(method.get, path, handler);
    }

    post(path: string, handler: Handler) {
        this.addHandler(method.post, path, handler);
    }

    put(path: string, handler: Handler) {
        this.addHandler(method.put, path, handler);
    }

    delete(path: string, handler: Handler) {
        this.addHandler(method.delete, path, handler);
    }

    // LIFECYCLE

    listen(cb?: () => void): void;
    listen(port: number | string, cb?: () => void): void;
    listen(port: number | string, host: string, cb?: () => void): void;
    listen(portOrCb?: number | string | (() => void), hostOrCb?: string | (() => void), cb?: () => void): void {
        let port: number | string | undefined;
        let host: string | undefined;
        let callback: (() => void) | undefined;

        if (typeof portOrCb === "function") {
            callback = portOrCb;
        } else {
            port = portOrCb;
            if (typeof hostOrCb === "function") {
                callback = hostOrCb;
            } else {
                host = hostOrCb;
                callback = cb;
            }
        }

        if (host !== undefined && port !== undefined) this.server.listen(Number(port), host, callback);
        else if (port !== undefined) this.server.listen(Number(port), callback);
        else this.server.listen(callback);
    }
}