import { FileUpload } from "../server/server";
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import zlib from "zlib";
import util from "util";
import crypto from "crypto";

const gzipAsync = util.promisify(zlib.gzip);
const gunzipAsync = util.promisify(zlib.gunzip);

export type PackedFileData = {
    hash: string;
    data: string;
    uploadDate: string;
    originalSize: number;
    compressedSize: number;
    contentType: string;
    fileName: string;
}

async function compressString(data: zlib.InputType): Promise<string> {
    try {
        const gzippedBuffer = await gzipAsync(data);
        return gzippedBuffer.toString("base64");
    } catch (error) {
        console.error("Error compressing string:", error);
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

/** Packs an uploaded file with additional metadata and compresses the data */
export async function packUploadedFileData(file: FileUpload): Promise<PackedFileData> {
    const hashHex = crypto.createHash("sha256").update(file.data).digest("hex");

    const base64 = Buffer.from(file.data).toString("base64");
    const compressedBase64 = await compressString(base64);

    const originalSize = Buffer.byteLength(file.data);
    const compressedSize = Buffer.byteLength(compressedBase64);

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
        fileName
    };
}

/** Decompress the data within a packaged filedata  */
export async function decompressFileData(file: PackedFileData): Promise<PackedFileData> {
    const decompressedData = await decompressString(file.data);
    return { ...file, data: decompressedData };
}