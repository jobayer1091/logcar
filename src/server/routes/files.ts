import { app } from "..";
import { CONFIG } from "../../config";
import { LogRail } from "../../database";
import { decompressFileData, PackedFileData, packUploadedFileData } from "../../files";
import { isAuthenticated } from "../packages/auth";

app.post("/upload", async (req, res) => {
    const hasAuth = isAuthenticated(req.headers.authorization || "");
    if (!hasAuth) return res.status(401).json({ error: "Unauthorized" });

    const railwayAuth = req.query.railwayApiKey || CONFIG.railway.apiKey;
    if (!railwayAuth) return res.status(400).json({ error: "Bad Request: No Railway API key provided" });

    const { files } = req;
    if (!files || files.length === 0) return res.status(400).json({ error: "Bad Request: No files uploaded" });

    const encryptionToken = req.query.encryptionToken;

    try {
        const uploads: PackedFileData[] = await Promise.all(files.map(file => packUploadedFileData(file)));
        const logRail = new LogRail({ railwayAuth });
        const uploadedIds: string[] = [];

        for (const file of uploads) {
            const result = logRail.create(file, { encryptionToken });
            uploadedIds.push(result.__id);
        }

        res.json(uploadedIds);
    } catch (error) {
        console.error("Error occurred during upload operation:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
})

app.get("/download/:id", async (req, res) => {
    const hasAuth = isAuthenticated(req.headers.authorization || "");
    if (!hasAuth) return res.status(401).json({ error: "Unauthorized" });

    const railwayAuth = req.query.railwayApiKey || CONFIG.railway.apiKey;
    if (!railwayAuth) return res.status(400).json({ error: "Bad Request: No Railway API key provided" });

    const fileId = req.params.id;
    if (!fileId) return res.status(400).json({ error: "Bad Request: No file ID provided" });

    const encryptionToken = req.query.encryptionToken;

    const logRail = new LogRail({ railwayAuth });

    logRail.read(req.params.id, { encryptionToken }).then(async (result) => {
        const packedFileData = result.data as PackedFileData;
        const fileData = await decompressFileData(packedFileData);

        const buffer = Buffer.from(fileData.data, "base64");
        console.log(`Download: Original size: ${packedFileData.originalSize}, Decompressed buffer size: ${buffer.length}`);

        res.setHeader("Content-Type", fileData.contentType);
        res.setHeader("Content-Length", buffer.length.toString());
        res.setHeader("Content-Disposition", `attachment; filename="${fileData.fileName}"`);
        res.end(buffer);
    }).catch((error) => {
        const message = (error as any).message || "Unknown error";
        console.error("Error occurred during read operation:", error);
        res.status(500).json({ error: message });
    });
});