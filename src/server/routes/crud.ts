import { app } from "..";
import { CONFIG } from "../../config";
import { LogRail } from "../../database";
import { decompressFileData, PackedFileData, packUploadedFileData } from "../../files";
import { isAuthenticated } from "../packages/auth";
import { FileUpload, ResponseTransformed } from "../packages/server";

async function handleFileUploads(files: FileUpload[], { railwayAuth, encryptionToken }: { railwayAuth: string, encryptionToken?: string }) {
    try {
        const uploads: PackedFileData[] = await Promise.all(files.map(file => packUploadedFileData(file)));
        const logRail = new LogRail({ railwayAuth });
        const uploadedIds: string[] = [];

        for (const file of uploads) {
            const result = logRail.create(file, { encryptionToken });
            uploadedIds.push(result.__id);
        }

        return uploadedIds;
    } catch (error) {
        throw new Error("File upload failed");
    }
}

async function handleFileDownloads(result: any, res: ResponseTransformed) {
    try {
        const packedFileData = result.data as PackedFileData;
        const fileData = await decompressFileData(packedFileData);

        const buffer = Buffer.from(fileData.data, "base64");
        console.log(`Download: Original size: ${packedFileData.originalSize}, Decompressed buffer size: ${buffer.length}`);

        res.setHeader("Content-Type", fileData.contentType);
        res.setHeader("Content-Length", buffer.length.toString());
        res.setHeader("Content-Disposition", `attachment; filename="${fileData.fileName}"`);
        res.end(buffer);
    } catch (error) {
        console.error("Error occurred during file download:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

app.post("/create", async (req, res) => {
    const hasAuth = isAuthenticated(req.headers.authorization || "");
    if (!hasAuth) return res.status(401).json({ error: "Unauthorized" });

    const railwayAuth = req.query.railwayApiKey || CONFIG.railway.apiKey;
    if (!railwayAuth) return res.status(400).json({ error: "Bad Request: No Railway API key provided" });

    const encryptionToken = req.query.encryptionToken;
    const allIds: string[] = [];

    if (req.body && Object.keys(req.body).length > 0) {
        const logRail = new LogRail({ railwayAuth });
        const result = logRail.create(req.body, { encryptionToken });
        allIds.push(result.__id);
    }

    if (req.files) {
        try {
            const uploadedIds = await handleFileUploads(req.files, { railwayAuth, encryptionToken });
            allIds.push(...uploadedIds);
        } catch (error) {
            console.error("Error occurred during upload operation:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }

    res.json(allIds);
})

app.get("/read", (req, res) => {
    const hasAuth = isAuthenticated(req.headers.authorization || "");
    if (!hasAuth) return res.status(401).json({ error: "Unauthorized" });

    const railwayAuth = req.query.railwayApiKey || CONFIG.railway.apiKey;
    if (!railwayAuth) return res.status(400).json({ error: "Bad Request: No Railway API key provided" });

    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Bad Request: No id provided" });

    const isRaw = req.query.raw == "true" || req.query.raw == "1";
    const isText = req.query.text == "true" || req.query.text == "1";
    const encryptionToken = req.query.encryptionToken;

    const logRail = new LogRail({ railwayAuth });

    const send = isText ? res.send : res.json;
    logRail.read(id, { encryptionToken }).then((result) => {
        if ("isFile" in result.data) handleFileDownloads(result, res);
        else if (isRaw) send(result.data);
        else send(result);
    }).catch((error) => {
        const message = (error as any).message || "Unknown error";
        console.error("Error occurred during read operation:", error);
        res.status(500).json({ error: message });
    });
})

app.put("/update", (req, res) => {
    const hasAuth = isAuthenticated(req.headers.authorization || "");
    if (!hasAuth) return res.status(401).json({ error: "Unauthorized" });

    const railwayAuth = req.query.railwayApiKey || CONFIG.railway.apiKey;
    if (!railwayAuth) return res.status(400).json({ error: "Bad Request: No Railway API key provided" });

    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Bad Request: No id provided" });

    const encryptionToken = req.query.encryptionToken;

    const { data } = req.body;
    if (!data) return res.status(400).json({ error: "Bad Request: Missing data" });

    const logRail = new LogRail({ railwayAuth });
    const result = logRail.update(id, data, { encryptionToken });

    res.json(result);
})

app.delete("/delete", (req, res) => {
    const hasAuth = isAuthenticated(req.headers.authorization || "");
    if (!hasAuth) return res.status(401).json({ error: "Unauthorized" });

    const railwayAuth = req.query.railwayApiKey || CONFIG.railway.apiKey;
    if (!railwayAuth) return res.status(400).json({ error: "Bad Request: No Railway API key provided" });

    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Bad Request: No id provided" });

    const logRail = new LogRail({ railwayAuth });
    logRail.delete(id);

    res.json({ success: true });
})