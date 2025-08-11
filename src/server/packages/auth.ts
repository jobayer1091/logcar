import { CONFIG } from "../../config";

export function isAuthenticated(auth: string) {
    if (!CONFIG.server.auth) return true;
    return auth === CONFIG.server.auth;
}