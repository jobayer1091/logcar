/** Expect number or string that could be a number */
export function num(env: string) {
    const value = process.env[env];
    if (!value) return undefined;

    if (typeof value === "number") return value;

    if (typeof value === "string") {
        const parsed = parseFloat(value);
        if (isNaN(parsed)) throw new Error(`Expected a string that can be converted to a number, got: "${value}"`);
        return parsed;
    }

    throw new Error(`Expected a string or number, got: ${typeof value}`);
}

/** Expect HTTP URL */
export function http(env: string) {
    const value = process.env[env];
    if (!value) return undefined;
    
    if (typeof value === "string") {
        try {
            new URL(value);
            return value;
        } catch {
            throw new Error(`Expected a valid URL string, got: "${value}"`);
        }
    }

    throw new Error(`Expected a string, got: ${typeof value}`);
}

/** Expect string */
export function str(env: string) {
    const value = process.env[env];
    if (!value) return undefined;
    
    if (typeof value === "string") return value;
    throw new Error(`Expected a string, got: ${typeof value}`);
}