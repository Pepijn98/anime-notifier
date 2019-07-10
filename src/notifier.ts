#!/usr/bin/env ts-node

import * as Sentry from "@sentry/node";
import Bluebird from "bluebird";
import settings from "../settings";
import Utils from "./utils/Utils";
import project from "../package.json";
import TurndownService from "turndown";
import PushNotifications from "@pusher/push-notifications-server";
import { Client, Message } from "eris";
import { Anime } from "./utils/Interfaces";
import { FeedItem, FeedEmitter, FeedError } from "rss-emitter-ts";

global.Promise = Bluebird;

const prefix = "r/";
const userAgent = `${project.name}/v${project.version} (${project.repository.url.replace(".git", "")})`;
const rss = new FeedEmitter({ userAgent });
const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced", emDelimiter: "*" });
const client = new Client(settings.env.startsWith("dev") ? settings.tokens.development : settings.tokens.production);
const beams = new PushNotifications({ instanceId: settings.beams.instanceId, secretKey: settings.beams.secretKey });
const utils = new Utils({ client, settings, turndown, beams });

Sentry.init({
    debug: settings.env.startsWith("dev"),
    dsn: settings.dsn,
    release: project.version,
    environment: settings.env,
    serverName: "anime-notifier"
});

turndown.addRule("cite", {
    filter: ["cite"],
    replacement: (content: string) => `*${content}*`
});

function isOK(msg: Message) {
    return msg.author && msg.author.id !== client.user.id && !msg.author.bot
}

/**
 * Main function (using it this way because nodejs does not allow top-level await)
 */
async function main(): Promise<void> {
    // Add all feeds to the rss emitter
    for (let i = 0; i < settings.rss.urls.length; i++) {
        rss.add({ url: settings.rss.urls[i], ignoreFirst: settings.rss.ignoreFirst, refresh: settings.rss.refresh });
    }

    rss.on("item:new", async (item: FeedItem) => {
        let watching = false;
        let title = "";
        let slug = "";
        let feed = "";
        let original = "";
        let index = 0;

        await utils.foreachAsync(settings.anime, async (anime: Anime) => {
            original = item.title;
            const check = item.title.toLowerCase().replace(/ /g, "-").replace(/---/g, "-");
            if (check.indexOf(anime.slug) !== -1) {
                title = anime.title;
                slug = anime.slug;
                feed = anime.feed;
                watching = true;
            }
        });

        if (watching) {
            const numbers = original.match(/\d+/g);
            let episode = "";
            if (numbers) {
                episode = numbers[index] ? numbers[index] : "00";
            } else {
                episode = "00";
            }

            const isHorribleSubs = feed === "hs" && item.title.toLowerCase().indexOf("horriblesubs") !== -1;
            const isAnimeFreak = feed === "af" && item.title.toLowerCase().indexOf("animefreak") !== -1;
            if (isHorribleSubs || isAnimeFreak) {
                await utils.sendPushNotification(`${title} - ${episode}`, `Episode #${episode} just got uploaded`);
                await utils.sendDiscordWebhook({ item, title, slug, episode });
            }
        }
    });

    rss.on("feed:error", (error: FeedError) => utils.handleException(error));

    client.on("ready", () => {
        console.log(`Logged in as ${client.user.username}`);
        client.editStatus("online", { name: "waiting for anime to release" });
    });

    client.on("messageCreate", (msg) => {
        if (msg.content.startsWith(prefix) && isOK(msg)) {
            const sliced = msg.content.slice(prefix.length, msg.content.length);
            const args = sliced.split(" ");
            const command = args.shift();
            switch (command) {
                case "ping": {
                    msg.channel.createMessage("pong!");
                    break;
                }
                case "list": {
                    const anime = settings.anime.map((a) => `**${a.title}** (${a.feed})`);
                    msg.channel.createMessage(anime.join("\n"));
                    break;
                }
            }
        }
    });

    client.on("error", (error: Error) => utils.handleException(error));

    process.on("SIGINT", () => { // Disconnect from discord when exiting
        client.disconnect({ reconnect: false });
        process.exit(0);
    });

    await client.connect();
}

main().catch((error) => utils.handleException(error));
