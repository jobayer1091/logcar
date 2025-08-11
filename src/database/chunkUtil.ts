export type Chunk<T = any> = {
    data: T | Chunk<T>[],
    index: number,
    total: number,
    isNested?: boolean,
}

export type FlatChunk<T = any> = {
    data: T,
    index: number,
    total: number,
    chunkId: string,
    parentId?: string,
    position: string, // JSON path to where this chunk belongs
}

/** Helper function to measure the string length of any value */
export function getStringLength(value: any): number {
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

/** Flattens nested chunks into a flat array for individual logging */
export function flattenChunks<T>(chunks: Chunk<T>[]): FlatChunk<any>[] {
    const flatChunks: FlatChunk<any>[] = [];
    let globalIndex = 0;

    function extractLeafData(data: any, parentId: string): void {
        if (Array.isArray(data) && data.length > 0 && data[0] && typeof data[0] === 'object' && 'index' in data[0] && 'data' in data[0]) {
            for (const chunk of data as Chunk<any>[]) {
                const chunkId = `${parentId}.c${chunk.index}`;
                if (chunk.isNested) {
                    extractLeafData(chunk.data, chunkId);
                } else {
                    flatChunks.push({
                        data: chunk.data,
                        index: globalIndex++,
                        total: 0, // updated later
                        chunkId: chunkId,
                        parentId: parentId,
                        position: `${parentId}[${chunk.index}]`
                    });
                }
            }
        } else if (typeof data === 'object' && data !== null) {
            for (const [key, value] of Object.entries(data)) {
                if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object' && 'index' in value[0] && 'data' in value[0]) {
                    extractLeafData(value, `${parentId}.${key}`);
                } else {
                    flatChunks.push({
                        data: { [key]: value },
                        index: globalIndex++,
                        total: 0,
                        chunkId: `${parentId}.${key}`,
                        parentId: parentId,
                        position: `${parentId}.${key}`
                    });
                }
            }
        } else {
            flatChunks.push({
                data: data,
                index: globalIndex++,
                total: 0,
                chunkId: parentId,
                position: parentId
            });
        }
    }

    // Process root chunks
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const rootId = `root${i}`;

        if (chunk.isNested) {
            extractLeafData(chunk.data, rootId);
        } else {
            flatChunks.push({
                data: chunk.data,
                index: globalIndex++,
                total: 0,
                chunkId: rootId,
                position: rootId
            });
        }
    }

    // Update indices and totals
    for (let i = 0; i < flatChunks.length; i++) {
        flatChunks[i].index = i;
        flatChunks[i].total = flatChunks.length;
    }

    return flatChunks;
}

/** Simple function to extract all individual data chunks for logging */
export function extractLogChunks<T>(input: T, maxChunkLength: number): Array<{ data: any, chunkId: string, index: number, total: number }> {
    const hierarchicalChunks = generateChunks(input, maxChunkLength);
    const flatChunks = flattenChunks(hierarchicalChunks);

    return flatChunks.map(fc => ({
        data: fc.data,
        chunkId: fc.chunkId,
        index: fc.index,
        total: fc.total
    }));
}

/** Reconstructs original data from log chunks */
export function reconstructFromLogChunks(logChunks: Array<{ data: any, chunkId: string, index: number, total: number }>): any {
    if (logChunks.length === 0) throw new Error("Cannot reconstruct from empty log chunks");

    const sortedChunks = logChunks.sort((a, b) => a.index - b.index);

    // Step 1: Group chunks by their content path
    const contentGroups = new Map<string, typeof logChunks>();

    for (const chunk of sortedChunks) {
        // Parse the chunk ID to understand its structure
        // map chunk indices to actual array indices
        // Examples:
        // "root0.mixedArray.c0" -> "root0.mixedArray.0" (chunk 0 = array index 0)
        // "root0.mixedArray.c1.0.c0" -> "root0.mixedArray.1" (chunk 1 = array index 1)  
        // "root0.mixedArray.c2.0.c0.objectInArray.c0" -> "root0.mixedArray.2.objectInArray"
        // "root0.mixedArray.c3" -> "root0.mixedArray.3" (chunk 3 = array index 3)

        let contentPath = chunk.chunkId;

        // For array-related chunks, we need to replace the chunk index with the actual array index
        // Pattern: mixedArray.cN where N is the chunk index, which is the array index
        contentPath = contentPath.replace(/\.mixedArray\.c(\d+)(?:\.0)?/g, '.mixedArray.$1');

        // Remove .cN.0 patterns (object access within array elements)
        contentPath = contentPath.replace(/\.c\d+\.0\./g, '.').replace(/\.c\d+\./g, '.');

        // Remove terminal chunk indices (.cN at the end)
        contentPath = contentPath.replace(/\.c\d+$/, '');

        if (!contentGroups.has(contentPath)) {
            contentGroups.set(contentPath, []);
        }
        contentGroups.get(contentPath)!.push(chunk);
    }

    // Step 2: Reassemble chunked content
    const reassembledContent = new Map<string, any>();

    for (const [contentPath, chunks] of contentGroups) {
        if (chunks.length === 1) {
            // Single chunk
            reassembledContent.set(contentPath, chunks[0].data);
        } else {
            // Multiple chunks: reassemble by finding the chunk sequence
            const sortedChunks = chunks.sort((a, b) => {
                const getLastChunkIndex = (chunkId: string) => {
                    const matches = chunkId.match(/\.c(\d+)$/);
                    if (matches) return parseInt(matches[1]);
                    return 0;
                };

                return getLastChunkIndex(a.chunkId) - getLastChunkIndex(b.chunkId);
            });

            // Reassemble based on data
            const firstData = sortedChunks[0].data;
            if (typeof firstData === 'string') {
                // String chunks: concatenate
                reassembledContent.set(contentPath, sortedChunks.map(c => c.data as string).join(''));
            } else if (Array.isArray(firstData)) {
                // Array chunks: flatten
                const reassembledArray: any[] = [];
                for (const chunk of sortedChunks) {
                    if (Array.isArray(chunk.data)) {
                        reassembledArray.push(...chunk.data);
                    }
                }
                reassembledContent.set(contentPath, reassembledArray);
            } else {
                // For other types use the first chunk's data
                reassembledContent.set(contentPath, firstData);
            }
        }
    }

    // Step 3: Reconstruct the original data structure
    const result: any = {};

    // Sort paths to process root first then by specificity
    const sortedPaths = Array.from(reassembledContent.keys()).sort((a, b) => {
        const aDepth = a.split('.').length;
        const bDepth = b.split('.').length;
        if (aDepth !== bDepth) return aDepth - bDepth;
        return a.localeCompare(b);
    });

    for (const contentPath of sortedPaths) {
        const value = reassembledContent.get(contentPath)!;
        const pathParts = contentPath.split('.');

        if (pathParts.length === 1 && pathParts[0].startsWith('root')) {
            // Root level: merge
            if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
                Object.assign(result, value);
            }
        } else {
            // Nested path: navigate and set value
            const propertyPath = pathParts.slice(1);

            let current = result;

            for (let i = 0; i < propertyPath.length - 1; i++) {
                const key = propertyPath[i];

                if (!(key in current)) {
                    const nextKey = propertyPath[i + 1];
                    if (!isNaN(parseInt(nextKey))) current[key] = [];
                    else current[key] = {};
                }

                current = current[key];
            }

            // Set the final value
            const finalKey = propertyPath[propertyPath.length - 1];

            if (!isNaN(parseInt(finalKey))) {
                // Array index
                const arrayIndex = parseInt(finalKey);
                if (!Array.isArray(current)) {
                    console.warn(`Expected array for index ${finalKey} but found ${typeof current}`);
                    continue;
                }

                // Validate array length
                while (current.length <= arrayIndex) current.push(undefined);

                if (Array.isArray(value)) {
                    // Array chunk: merge elements starting at the index
                    for (let j = 0; j < value.length; j++) {
                        if (current[arrayIndex + j] === undefined) current[arrayIndex + j] = value[j];
                    }
                } else {
                    // value or object
                    current[arrayIndex] = value;
                }
            } else {
                // Object property
                current[finalKey] = value;
            }
        }
    }

    return result;
}
