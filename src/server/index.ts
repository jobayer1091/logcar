import { CONFIG } from "../config";
import { Server } from "./packages/server";

export const app = new Server();

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(CONFIG.server.port, async () => {
    // not super happy having to dynamically import these 
    // buttttt i dont have time for a proper implementation right now
    await import("./routes/crud");
    await import("./routes/files");

    console.log(`Server is running on port ${CONFIG.server.port}`);
});