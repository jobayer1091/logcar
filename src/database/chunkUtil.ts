export type Chunk<T = any> = {
    data: T | Chunk<T>[],
    index: number,
    total: number,
    isNested?: boolean,
}

/** Helper function to measure the string length of any value */
function getStringLength(value: any): number {
    if (typeof value === 'string') {
        return value.length;
    }
    if (Array.isArray(value)) {
        return value.reduce((total: number, item) => total + getStringLength(item), 0);
    }
    if (typeof value === 'object' && value !== null) {
        return Object.values(value).reduce((total: number, item) => total + getStringLength(item), 0);
    }
    return String(value).length;
}

// Helper function to split arrays based on length
function splitArray(arr: any[], maxLength: number): any[][] {
    if (getStringLength(arr) <= maxLength) return [arr];

    const chunks: any[][] = [];
    let currentChunk: any[] = [];
    let currentLength = 0;

    for (const item of arr) {
        const itemLength = getStringLength(item);

        // If entry exceeds maximum length itself, recursively chunk
        if (itemLength > maxLength) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
                currentLength = 0;
            }

            chunks.push([{ __RECURSIVE_CHUNK__: item }]);
            continue;
        }

        if (currentLength + itemLength > maxLength && currentChunk.length > 0) {
            // Exceeding limit, new chunk
            chunks.push(currentChunk);
            currentChunk = [item];
            currentLength = itemLength;
        } else {
            // Safe to insert into current chunk
            currentChunk.push(item);
            currentLength += itemLength;
        }
    }

    // Add last chunk
    if (currentChunk.length > 0) chunks.push(currentChunk);

    return chunks;
}

// Helper function to split objects intelligently based on target length
function splitObject(obj: Record<string, any>, maxLength: number): Record<string, any>[] {
    if (getStringLength(obj) <= maxLength) return [obj];

    const chunks: Record<string, any>[] = [];
    let currentChunk: Record<string, any> = {};
    let currentLength = 0;

    for (const [key, value] of Object.entries(obj)) {
        const keyLength = getStringLength(key);
        const valueLength = getStringLength(value);
        const entryLength = keyLength + valueLength;

        // If entry exceeds maximum length itself, recursively chunk
        if (valueLength > maxLength) {
            if (Object.keys(currentChunk).length > 0) {
                chunks.push(currentChunk);
                currentChunk = {};
                currentLength = 0;
            }

            chunks.push({ [key]: { __RECURSIVE_CHUNK__: value } });
            continue;
        }

        if (currentLength + entryLength > maxLength && Object.keys(currentChunk).length > 0) {
            // Exceeding limit, new chunk
            chunks.push(currentChunk);
            currentChunk = { [key]: value };
            currentLength = entryLength;
        } else {
            // Safe to insert into current chunk
            currentChunk[key] = value;
            currentLength += entryLength;
        }
    }

    // Add last chunk
    if (Object.keys(currentChunk).length > 0) chunks.push(currentChunk);

    return chunks;
}

export function generateChunks<T>(input: T, maxChunkLength: number): Chunk<T>[] {
    // Handle strings
    if (typeof input === 'string') {
        const chunks: Chunk<string>[] = [];
        for (let i = 0; i < input.length; i += maxChunkLength) {
            chunks.push({
                data: input.slice(i, i + maxChunkLength),
                index: chunks.length,
                total: Math.ceil(input.length / maxChunkLength)
            });
        }
        return chunks as Chunk<T>[];
    }

    // Handle arrays
    if (Array.isArray(input)) {
        const splitArrays = splitArray(input, maxChunkLength);
        return splitArrays.map((chunk, index) => {
            const processedChunk = chunk.map(item => {
                if (item && typeof item === 'object' && '__RECURSIVE_CHUNK__' in item) {
                    return generateChunks(item.__RECURSIVE_CHUNK__, maxChunkLength);
                }
                return item;
            });

            const hasRecursiveChunks = processedChunk.some(item =>
                Array.isArray(item) && item.length > 0 && item[0] && typeof item[0] === 'object' && 'index' in item[0]
            );

            return {
                data: processedChunk as T,
                index,
                total: splitArrays.length,
                isNested: hasRecursiveChunks
            };
        });
    }

    // Handle objects
    if (typeof input === 'object' && input !== null) {
        const splitObjects = splitObject(input as Record<string, any>, maxChunkLength);
        return splitObjects.map((chunk, index) => {
            const processedChunk: Record<string, any> = {};
            for (const [key, value] of Object.entries(chunk)) {
                if (value && typeof value === 'object' && '__RECURSIVE_CHUNK__' in value) {
                    processedChunk[key] = generateChunks(value.__RECURSIVE_CHUNK__, maxChunkLength);
                } else {
                    processedChunk[key] = value;
                }
            }

            const hasRecursiveChunks = Object.values(processedChunk).some(value =>
                Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object' && 'index' in value[0]
            );

            return {
                data: processedChunk as T,
                index,
                total: splitObjects.length,
                isNested: hasRecursiveChunks
            };
        });
    }

    // Fallback for other types
    const stringLength = getStringLength(input);
    if (stringLength <= maxChunkLength) {
        return [{
            data: input,
            index: 0,
            total: 1
        }];
    } else {
        // Fallback to string chunking for large unknown types
        const stringValue = String(input);
        const chunks: Chunk<string>[] = [];
        for (let i = 0; i < stringValue.length; i += maxChunkLength) {
            chunks.push({
                data: stringValue.slice(i, i + maxChunkLength),
                index: chunks.length,
                total: Math.ceil(stringValue.length / maxChunkLength)
            });
        }
        return chunks as Chunk<T>[];
    }
}

/** Reassembles chunks back into their original data structure */
export function reassembleChunks<T>(chunks: Chunk<T>[]): T {
    if (chunks.length === 0) throw new Error("Cannot reassemble empty chunks array");

    const sortedChunks = chunks.sort((a, b) => a.index - b.index);

    // Validation, integrity and sequentialism
    const expectedTotal = sortedChunks[0].total;
    if (sortedChunks.length !== expectedTotal) throw new Error(`Incomplete chunk set: expected ${expectedTotal}, got ${sortedChunks.length}`);

    for (let i = 0; i < sortedChunks.length; i++) {
        if (sortedChunks[i].index !== i) throw new Error(`Invalid chunk sequence: expected index ${i}, got ${sortedChunks[i].index}`);
    }

    if (sortedChunks.length === 1) {
        const singleChunk = sortedChunks[0];
        if (singleChunk.isNested) return reassembleNestedData(singleChunk.data);
        return singleChunk.data as T;
    }

    const firstData = sortedChunks[0].data;

    // Handle strings: concatenate string pieces
    if (typeof firstData === 'string') {
        return sortedChunks
            .map(chunk => chunk.isNested ? reassembleNestedData(chunk.data) : chunk.data)
            .map(data => String(data))
            .join('') as T;
    }

    // Handle arrays: flatten and combine
    if (Array.isArray(firstData)) {
        const result: any[] = [];
        for (const chunk of sortedChunks) {
            let processedData;
            if (chunk.isNested) processedData = reassembleNestedData(chunk.data);
            else processedData = chunk.data;

            if (Array.isArray(processedData)) result.push(...processedData);
        }
        return result as T;
    }

    // Handle objects: merge
    if (typeof firstData === 'object' && firstData !== null) {
        const result: Record<string, any> = {};
        for (const chunk of sortedChunks) {
            let processedData;
            if (chunk.isNested) processedData = reassembleNestedData(chunk.data);
            else processedData = chunk.data;

            if (typeof processedData === 'object' && processedData !== null) Object.assign(result, processedData);
        }
        return result as T;
    }

    // Fallback: string concatenation
    return sortedChunks
        .map(chunk => {
            const processedData = chunk.isNested ? reassembleNestedData(chunk.data) : chunk.data;
            return String(processedData);
        })
        .join('') as T;
}

/** Helper function to reassemble nested chunk data */
function reassembleNestedData(data: any): any {
    if (Array.isArray(data)) {
        return data.map(item => {
            if (Array.isArray(item) && item.length > 0 && item[0] && typeof item[0] === 'object' && 'index' in item[0] && 'total' in item[0]) {
                return reassembleChunks(item as Chunk<any>[]);
            }
            return item;
        });
    }

    if (typeof data === 'object' && data !== null) {
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object' && 'index' in value[0] && 'total' in value[0]) {
                result[key] = reassembleChunks(value as Chunk<any>[]);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    return data;
}
