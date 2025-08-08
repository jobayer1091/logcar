import { ProcessedChunk } from "./common";
import logs from "./logs";

const API_CHUNKS = {
    logs
};

type RailwayConfig = {
    authorization: string;
}

export class Railway {
    authorization: string;

    constructor(config: RailwayConfig) {
        this.authorization = config.authorization;
    }

    public api = (() => {
        // Real nasty way of processing gql chunks but will have to do for now lmfao
        function processChunk<T>(chunk: T, authorization: string): ProcessedChunk<T> {
            if (chunk && typeof chunk === 'object' && 'generate' in chunk && typeof chunk.generate === "function") {
                return (chunk as any).generate(authorization);
            }

            const result: any = {};
            for (const key in chunk) {
                if (Object.prototype.hasOwnProperty.call(chunk, key)) {
                    result[key] = processChunk((chunk as any)[key], authorization);
                }
            }
            return result;
        }

        return processChunk(API_CHUNKS, this.authorization);
    })();
}

const rail = new Railway({ authorization: "" })