import { CONFIG } from "../config";

export class RailwayGQL<TVariables = Record<string, any>, TResponse = any> {
    private query: string;

    constructor(query: string) {
        this.query = query;
    }

    /** Generates an executable for making requests to the backboard */
    generate(authorization: string): (variables: TVariables) => Promise<TResponse> {
        const query = this.query;
        return async function (variables: TVariables): Promise<TResponse> {
            console.debug(`Executing GQL query: ${query} using auth ${authorization} and with variables:`, variables);

            const result = await fetch(CONFIG.railway.backboard, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `${authorization}`
                },
                body: JSON.stringify({ query, variables })
            });

            return result.json() as Promise<TResponse>;
        }
    }
}

// Type definitions for API structure
type ProcessedQuery<T extends RailwayGQL<any, any>> = T extends RailwayGQL<infer V, infer R>
    ? (variables: V) => Promise<R>
    : never;

export type ProcessedChunk<T> = {
    [K in keyof T]: T[K] extends RailwayGQL<any, any>
    ? ProcessedQuery<T[K]>
    : T[K] extends Record<string, any>
    ? ProcessedChunk<T[K]>
    : T[K]
};