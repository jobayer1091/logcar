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

type RequestTransformed = IncomingMessage & {
    query: { [key: string]: any };
    body: { [key: string]: any };
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

async function transformReq(req: IncomingMessage): Promise<RequestTransformed> {
    const query: { [key: string]: any } = {};

    // Parse query parameters
    if (req.url) {
        const urlParts = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
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

    if (req.method && ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
        const chunks: Buffer[] = [];

        for await (const chunk of req) {
            chunks.push(chunk);
        }

        const rawBody = Buffer.concat(chunks).toString();
        if (rawBody) {
            const contentType = req.headers['content-type'] || '';

            try {
                if (contentType.includes('application/json')) {
                    // JSON
                    body = JSON.parse(rawBody);
                } else if (contentType.includes('application/x-www-form-urlencoded')) {
                    // URL-encoded
                    const params = new URLSearchParams(rawBody);
                    for (const [key, value] of params) {
                        body[key] = value;
                    }
                } else {
                    // RAW
                    body = { _raw: rawBody };
                }
            } catch (error) {
                // RAW
                body = { _raw: rawBody };
            }
        }
    }

    return Object.assign(req, { query, body });
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