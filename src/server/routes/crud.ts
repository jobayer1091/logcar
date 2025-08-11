import { app } from "..";
import { CONFIG } from "../../config";
import { LogRail } from "../../database";
import { isAuthenticated } from "../packages/auth";

app.post("/create", (req, res) => {
    const hasAuth = isAuthenticated(req.headers.authorization || "");
    if (!hasAuth) return res.status(401).json({ error: "Unauthorized" });

    const railwayAuth = req.query.railwayApiKey || CONFIG.railway.apiKey;
    if (!railwayAuth) return res.status(400).json({ error: "Bad Request: No Railway API key provided" });

    const encryptionToken = req.query.encryptionToken;

    const { data } = req.body;
    if (!data) return res.status(400).json({ error: "Bad Request: Missing data" });

    const logRail = new LogRail({ railwayAuth });
    const result = logRail.create(data, { encryptionToken });

    res.json(result);
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
    const encryptionToken = req.query.encryptionToken;

    const logRail = new LogRail({ railwayAuth });

    const send = isText ? res.send : res.json;
    logRail.read(collectionId, { encryptionToken }).then((result) => {
        if (isRaw) send(result.data);
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

    const encryptionToken = req.query.encryptionToken;

    const { id, data } = req.body;
    if (!id || !data) return res.status(400).json({ error: "Bad Request: Missing id or data" });

    const logRail = new LogRail({ railwayAuth });
    const result = logRail.update(id, data, { encryptionToken });

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