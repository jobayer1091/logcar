import JsonLogger from "./logger";
import "./server";

function generateString(length: number, options?: { prefix?: string; postfix?: string }): string {
    const characters = "abcdefghijklmnopqrstuvwxyz";
    let result = "";
    const prefix = options?.prefix ?? "";
    const postfix = options?.postfix ?? "";
    const coreLength = Math.max(0, length - prefix.length - postfix.length);

    for (let i = 0; i < coreLength; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    return prefix + result + postfix;
}

function gen() {
    return generateString(50_000, { prefix: "<start>", postfix: "<end>" });
}

const log = new JsonLogger({ origin: "index" });
log.info(gen(), { chunk1: gen(), chunk2: gen() });
log.info("Message Test", { chunk1: gen(), chunk2: gen() });