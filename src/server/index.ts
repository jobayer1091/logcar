import { CONFIG } from "../config";
import { LogRail } from "../database";
import { Server } from "./server";

const app = new Server();

app.get("/", (req, res) => {
    res.send("Hello World!");
})

app.get("/read", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ error: "Unauthorized: No authorization header provided" });
        return;
    }

    const collectionId = req.query.collectionId;
    if (!collectionId) {
        res.status(400).json({ error: "Bad Request: No collectionId provided" });
        return;
    }

    const isRaw = req.query.raw === "true" || req.query.raw === "1";

    const logRail = new LogRail({ railwayAuth: authHeader });

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
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ error: "Unauthorized: No authorization header provided" });
        return;
    }

    const { data } = req.body;
    if (!data) {
        res.status(400).json({ error: "Bad Request: Missing data" });
        return;
    }

    const logRail = new LogRail({ railwayAuth: authHeader });
    const result = logRail.create(data);

    res.json(result);
})

app.put("/update", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ error: "Unauthorized: No authorization header provided" });
        return;
    }

    const { id, data } = req.body;
    if (!id || !data) {
        res.status(400).json({ error: "Bad Request: Missing id or data" });
        return;
    }

    const logRail = new LogRail({ railwayAuth: authHeader });
    const result = logRail.update(id, data);

    res.json(result);
})

app.delete("/delete", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ error: "Unauthorized: No authorization header provided" });
        return;
    }

    const { id } = req.body;
    if (!id) {
        res.status(400).json({ error: "Bad Request: Missing id" });
        return;
    }

    const logRail = new LogRail({ railwayAuth: authHeader });
    logRail.delete(id);

    res.json({ success: true });
})

app.listen(CONFIG.server.port, () => {
    console.log(`Server is running on port ${CONFIG.server.port}`);
})