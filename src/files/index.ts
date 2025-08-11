import crypto from "crypto";
import util from "util";
import zlib from "zlib";
import { FileUpload } from "../server/packages/server";

const gzipAsync = util.promisify(zlib.gzip);
const gunzipAsync = util.promisify(zlib.gunzip);

async function compressString(data: zlib.InputType): Promise<string> {
    try {
        const gzippedBuffer = await gzipAsync(data);
        return gzippedBuffer.toString("base64");
    } catch (error) {
        console.error("Error compressing string:", error);
        throw error;
    }
}

async function compressBinary(data: Buffer): Promise<string> {
    try {
        const gzippedBuffer = await gzipAsync(data);
        return gzippedBuffer.toString("base64");
    } catch (error) {
        console.error("Error compressing binary data:", error);
        throw error;
    }
}

async function decompressString(data: string): Promise<string> {
    try {
        const buffer = Buffer.from(data, "base64");
        const gunzippedBuffer = await gunzipAsync(buffer);
        return gunzippedBuffer.toString("utf-8");
    } catch (error) {
        console.error("Error decompressing string:", error);
        throw error;
    }
}

async function decompressToBase64(data: string): Promise<string> {
    try {
        const buffer = Buffer.from(data, "base64");
        const gunzippedBuffer = await gunzipAsync(buffer);
        return gunzippedBuffer.toString("base64");
    } catch (error) {
        console.error("Error decompressing to base64:", error);
        throw error;
    }
}

export type PackedFileData = {
    hash: string;
    data: string;
    uploadDate: string;
    originalSize: number;
    compressedSize: number;
    contentType: string;
    fileName: string;
    isFile: true;
}

/** Check if a content type represents binary data */
export function isBinaryContentType(contentType: string): boolean {
    const textTypes = [
        'text/',
        'application/json',
        'application/xml',
        'application/javascript',
        'application/x-www-form-urlencoded'
    ];
    
    return !textTypes.some(type => contentType.toLowerCase().startsWith(type));
}

/** Packs an uploaded file with additional metadata and compresses the data */
export async function packUploadedFileData(file: FileUpload): Promise<PackedFileData> {
    const hashHex = crypto.createHash("sha256").update(file.data).digest("hex");

    const compressedBase64 = await compressBinary(file.data);

    const originalSize = file.data.length;
    const compressedBuffer = Buffer.from(compressedBase64, "base64");
    const compressedSize = compressedBuffer.length;

    const uploadDate = new Date().toISOString();
    const contentType = file.contentType;
    const fileName = file.filename;

    return {
        hash: hashHex,
        data: compressedBase64,
        uploadDate,
        originalSize,
        compressedSize,
        contentType,
        fileName,
        isFile: true,
    };
}

/** Decompress the data within a packaged filedata  */
export async function decompressFileData(file: PackedFileData): Promise<PackedFileData> {
    const decompressedData = await decompressToBase64(file.data);
    return { ...file, data: decompressedData };
}