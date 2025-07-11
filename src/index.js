const CF = new(require("./utils"))();
const fs = require("fs").promises;
const path = require("path");
const {
    Client
} = require("discord-rpc");
require("dotenv").config();

const {
    IP,
    clientId,
    showGamertag
} = process.env;
const titleIdsFile = "TitleIDs.txt";
let currentTitleId = null;

const rpc = new Client({
    transport: "ipc"
});

async function startRPC() {
    try {
        rpc.removeAllListeners();
        rpc.on("ready", () => console.log("Connected to Discord client"));
        await rpc.login({
            clientId
        });
    } catch (err) {
        console.error("Discord RPC connection failed:", err.message);
        process.exit(1);
    }
}

const getMemoryHex = async (address, length, label) => {
    try {
        const memory = await CF.getMemory(address, length);
        return memory.toString("hex").toUpperCase();
    } catch (err) {
        throw new Error(`Unable to get ${label}: ${err.message}`);
    }
};

const getTitleId = () => getMemoryHex(0xC0292070, 4, "Title ID");
const getProfileId = () => getMemoryHex(0xC0291FF0, 7, "Profile ID");

async function getGamertag() {
    try {
        const hex = await CF.getMemory(0x81AA28FC, 32);
        const buffer = Buffer.from(hex, "hex");
        let name = "";

        for (let i = 0; i < buffer.length; i += 2) {
            const code = buffer.readUInt16BE(i);
            if (code >= 32 && code <= 126) name += String.fromCharCode(code);
        }

        return name.trim();
    } catch (err) {
        throw new Error("Unable to retrieve Gamertag: " + err.message);
    }
}

async function updateGamePresence(titleId) {
    try {
        const data = await fs.readFile(path.join(__dirname, titleIdsFile), "utf-8");
        const match = data.split("\n").find(line => line.split(",")[0].trim() === titleId.trim());

        if (!match) return console.error(`Title ID not recognized: ${titleId}`);

        const [, gameName] = match.split(",");
        const presence = {
            state: `Playing ${gameName.trim()}`,
            largeImageKey: "main_menu",
            largeImageText: "Made By Avieah",
            smallImageKey: "main_menu",
            smallImageText: "https://github.com/Safauri",
            startTimestamp: new Date(),
        };

        if (showGamertag.toLowerCase() === "true") {
            const tag = await getGamertag();
            if (tag) presence.details = `Gamertag: ${tag}`;
        }

        rpc.setActivity(presence);
        console.log(`Presence updated: ${gameName.trim()}`);
    } catch (err) {
        console.error("Presence update failed:", err.message);
    }
}

async function checkActivity() {
    while (true) {
        try {
            const titleId = await getTitleId();
            const profileId = await getProfileId();

            if (!titleId || !profileId) {
                console.error("Missing Title ID or Profile ID");
            } else if (titleId !== currentTitleId) {
                currentTitleId = titleId;
                await updateGamePresence(titleId);
            }
        } catch (err) {
            console.error("Activity check error:", err.message);
        } finally {
            await new Promise(res => setTimeout(res, 180000));
        }
    }
}

(async () => {
    try {
        await CF.connect(IP);
        console.log("Connected to Xbox");
        await startRPC();
        await checkActivity();
    } catch (err) {
        console.error("Xbox connection failed:", err.message);
    }
})();