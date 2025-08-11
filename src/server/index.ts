import { CONFIG } from "../config";
import { LogRail } from "../database";
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

    const logRail = new LogRail({ railwayAuth });

    logRail.read(collectionId).then((result) => {
        if (isRaw) res.json(result.data);
        else res.json(result);
    }).catch((error) => {
        const message = (error as any).message || "Unknown error";
        console.error("Error occurred during read operation:", error);
        res.status(500).json({ error: message });
    });
})

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