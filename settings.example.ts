import { Settings } from "./src/utils/Interfaces";

const settings: Settings = {
    env: process.env.NODE_ENV || "development",
    dsn: "", // Sentry dsn to log exceptions
    tokens: {
        production: "", // Production discord bot token
        development: "" // Development discord bot token
    },
    anime: [ // Array of anime you're watching, title and slug from horriblesubs
        { title: "", slug: "" }
    ],
    rss: {
        url: "https://nyaa.si/?page=rss&u=HorribleSubs&q=1080",
        ignoreFirst: true,
        refresh: 10000,
    },
    beams: {
        instanceId: "", // Beams instance id
        secretKey: "" // Beams secret
    },
    webhook: {
        id: "", // Discord webhook id
        token: "" // Discord webhook token
    }
};

export default settings;
