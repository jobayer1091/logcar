import crypto from "crypto";
import util from "util";
import zlib from "zlib";
import { FileUpload } from "../server/server";

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

/** Packs an uploaded file with additional metadata and compresses the data */
export async function packUploadedFileData(file: FileUpload): Promise<PackedFileData> {
    const hashHex = crypto.createHash("sha256").update(file.data).digest("hex");

    const compressedBuffer = await gzipAsync(file.data);
    const compressedBase64 = compressedBuffer.toString("base64");

    const originalSize = Buffer.byteLength(file.data);
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
        fileName
    };
}

/** Decompress the data within a packaged filedata  */
export async function decompressFileData(file: PackedFileData): Promise<PackedFileData> {
    const compressedBuffer = Buffer.from(file.data, "base64");
    const decompressedBuffer = await gunzipAsync(compressedBuffer);
    const decompressedBase64 = decompressedBuffer.toString("base64");

    return { ...file, data: decompressedBase64 };
}

/** Decompress file data and return as Buffer for direct download */
export async function decompressFileDataToBuffer(file: PackedFileData): Promise<{ buffer: Buffer; metadata: Omit<PackedFileData, 'data'> }> {
    const compressedBuffer = Buffer.from(file.data, "base64");
    const decompressedBuffer = await gunzipAsync(compressedBuffer);

    return {
        buffer: decompressedBuffer,
        metadata: {
            hash: file.hash,
            uploadDate: file.uploadDate,
            originalSize: file.originalSize,
            compressedSize: file.compressedSize,
            contentType: file.contentType,
            fileName: file.fileName
        }
    };
}