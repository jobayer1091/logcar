import { CONFIG } from "../config";
import { LogRail } from "../database";
import { decompressFileData, PackedFileData, packUploadedFileData } from "../files";
import { isAuthenticated } from "./auth";
import { Server } from "./server";

const app = new Server();

app.get("/", (req, res) => {
    res.send("Hello World!");
})

app.get("/read", (req, res) => {
    const hasAuth = isAuthenticated(req.headers.authorization || "");
    if (!hasAuth) return res.status(401).json({ error: "Unauthorized" });

    const railwayAuth = req.query.railwayApiKey || CONFIG.railway.apiKey;
    if (!railwayAuth) return res.status(400).json({ error: "Bad Request: No Railway API key provided" });

    const collectionId = req.query.collectionId;
    if (!collectionId) return res.status(400).json({ error: "Bad Request: No collectionId provided" });

    const isRaw = req.query.raw == "true" || req.query.raw == "1";
    const isText = req.query.text == "true" || req.query.text == "1";

    const logRail = new LogRail({ railwayAuth });

    const send = isText ? res.send : res.json;
    logRail.read(collectionId).then((result) => {
        if (isRaw) send(result.data);
        else send(result);
    }).catch((error) => {
        const message = (error as any).message || "Unknown error";
        console.error("Error occurred during read operation:", error);
        res.status(500).json({ error: message });
    });
})

app.post("/upload", async (req, res) => {
    const hasAuth = isAuthenticated(req.headers.authorization || "");
    if (!hasAuth) return res.status(401).json({ error: "Unauthorized" });

    const railwayAuth = req.query.railwayApiKey || CONFIG.railway.apiKey;
    if (!railwayAuth) return res.status(400).json({ error: "Bad Request: No Railway API key provided" });

    const { files } = req;
    if (!files || files.length === 0) return res.status(400).json({ error: "Bad Request: No files uploaded" });

    try {
        const uploads: PackedFileData[] = await Promise.all(files.map(file => packUploadedFileData(file)));
        const logRail = new LogRail({ railwayAuth });
        const uploadedIds: string[] = [];

        for (const file of uploads) {
            const result = logRail.create(file);
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

    const logRail = new LogRail({ railwayAuth });

    logRail.read(req.params.id).then(async (result) => {
        const packedFileData = result as PackedFileData;
        const fileData = await decompressFileData(packedFileData);

        const buffer = Buffer.from(fileData.data, "base64");
        res.setHeader("Content-Type", fileData.contentType);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Content-Disposition", `attachment; filename="${fileData.fileName}"`);
        res.end(buffer);
    }).catch((error) => {
        const message = (error as any).message || "Unknown error";
        console.error("Error occurred during read operation:", error);
        res.status(500).json({ error: message });
    });
});

app.post("/create", (req, res) => {
    const hasAuth = isAuthenticated(req.headers.authorization || "");
    if (!hasAuth) return res.status(401).json({ error: "Unauthorized" });

    const railwayAuth = req.query.railwayApiKey || CONFIG.railway.apiKey;
    if (!railwayAuth) return res.status(400).json({ error: "Bad Request: No Railway API key provided" });

    const { data } = req.body;
    if (!data) return res.status(400).json({ error: "Bad Request: Missing data" });

    const logRail = new LogRail({ railwayAuth });
    const result = logRail.create(data);

    res.json(result);
})

app.put("/update", (req, res) => {
    const hasAuth = isAuthenticated(req.headers.authorization || "");
    if (!hasAuth) return res.status(401).json({ error: "Unauthorized" });

    const railwayAuth = req.query.railwayApiKey || CONFIG.railway.apiKey;
    if (!railwayAuth) return res.status(400).json({ error: "Bad Request: No Railway API key provided" });

    const { id, data } = req.body;
    if (!id || !data) return res.status(400).json({ error: "Bad Request: Missing id or data" });

    const logRail = new LogRail({ railwayAuth });
    const result = logRail.update(id, data);

    res.json(result);
})

app.delete("/delete", (req, res) => {
    const hasAuth = isAuthenticated(req.headers.authorization || "");
    if (!hasAuth) return res.status(401).json({ error: "Unauthorized" });

    const railwayAuth = req.query.railwayApiKey || CONFIG.railway.apiKey;
    if (!railwayAuth) return res.status(400).json({ error: "Bad Request: No Railway API key provided" });

    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Bad Request: Missing id" });

    const logRail = new LogRail({ railwayAuth });
    logRail.delete(id);

    res.json({ success: true });
})

app.listen(CONFIG.server.port, () => {
    console.log(`Server is running on port ${CONFIG.server.port}`);
})