export type Chunk<T = any> = {
    data: T,
    index: number,
    total: number,
}

// Helper function to measure the string length of any value
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
        const entryLength = getStringLength(key) + getStringLength(value);

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
        return splitArrays.map((chunk, index) => ({
            data: chunk as T,
            index,
            total: splitArrays.length
        }));
    }

    // Handle objects
    if (typeof input === 'object' && input !== null) {
        const splitObjects = splitObject(input as Record<string, any>, maxChunkLength);
        return splitObjects.map((chunk, index) => ({
            data: chunk as T,
            index,
            total: splitObjects.length
        }));
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
