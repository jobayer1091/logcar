import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from 'crypto';

export interface EncryptionConfig {
    enabled: boolean;
    globalKey?: string;
    algorithm?: string;
}

export class DataEncryption {
    private config: EncryptionConfig;
    private algorithm: string;

    constructor(config: EncryptionConfig) {
        this.config = config;
        this.algorithm = config.algorithm || 'aes-256-cbc';
    }

    /** Check if input is a pre-made encryption key (64 hex chars) */
    private isEncryptionKey(input: string): boolean {
        return /^[0-9a-fA-F]{64}$/.test(input);
    }

    /** Derives a 256-bit encryption key from password and salt */
    private deriveKey(password: string, salt: string): Buffer {
        return pbkdf2Sync(password, salt, 100000, 32, 'sha512');
    }

    /** Gets the actual encryption key - either uses pre-made key or derives from password */
    private getEncryptionKey(input: string, salt: string): Buffer {
        if (this.isEncryptionKey(input)) return Buffer.from(input, 'hex');
        else return this.deriveKey(input, salt);
    }

    /** Encrypts data using either global key or provided key (password or pre-made key) */
    encrypt<T>(data: T, customKey?: string): string {
        if (!this.config.enabled && !customKey) return JSON.stringify(data);

        const key = customKey || this.config.globalKey;
        if (!key) throw new Error('No encryption key available');

        const jsonString = JSON.stringify(data);

        const salt = randomBytes(16).toString('hex');
        const iv = randomBytes(16);

        const encryptionKey = this.getEncryptionKey(key, salt);
        const cipher = createCipheriv(this.algorithm, encryptionKey, iv);

        let encrypted = cipher.update(jsonString, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // salt:iv:encryptedData
        return `${salt}:${iv.toString('hex')}:${encrypted}`;
    }

    /** Decrypts data using either global key or provided key (password or pre-made key) */
    decrypt<T = any>(encryptedData: string, customKey?: string): T {
        if (!encryptedData.includes(':') || (!this.config.enabled && !customKey)) return JSON.parse(encryptedData);

        const key = customKey || this.config.globalKey;
        if (!key) throw new Error('No decryption key available');

        try {
            // salt:iv:encryptedData
            const [salt, ivHex, encrypted] = encryptedData.split(':');
            const iv = Buffer.from(ivHex, 'hex');

            const decryptionKey = this.getEncryptionKey(key, salt);
            const decipher = createDecipheriv(this.algorithm, decryptionKey, iv);

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return JSON.parse(decrypted);
        } catch (error) {
            throw new Error(`Decryption failed: ${(error as Error).message}`);
        }
    }

    /** Hash a string for use as encryption key (one-way) */
    static hashKey(input: string): string {
        return createHash('sha256').update(input).digest('hex');
    }

    /** Generate a random 256-bit encryption key */
    static generateKey(): string {
        return randomBytes(32).toString('hex');
    }
}
