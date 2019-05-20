#!/usr/bin/env ts-node

import * as Sentry from "@sentry/node";
import Bluebird from "bluebird";
import settings from "../settings";
import Utils from "./utils/Utils";
import project from "../package.json";
import TurndownService from "turndown";
import PushNotifications from "@pusher/push-notifications-server";
import { Client } from "eris";
import { Anime } from "./utils/Interfaces";
import { FeedItem, FeedEmitter, FeedError } from "rss-emitter-ts";

global.Promise = Bluebird;

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
        let anime: Anime = null;
        let original = "";
        let index = 0;

        await utils.foreachAsync(settings.anime, async (a: Anime) => {
            original = item.title;
            const check = item.title.toLowerCase().replace(/ /g, "-").replace(/---/g, "-");
            if (check.indexOf(a.slug) !== -1) {
                anime = a
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

            const isHorribleSubs = anime.feed === "hs" && item.title.toLowerCase().indexOf("horriblesubs") !== -1;
            const isAnimeFreak = anime.feed === "af" && item.title.toLowerCase().indexOf("animefreak") !== -1;
            if (anime && isHorribleSubs || isAnimeFreak) {
                await utils.sendPushNotification(`${anime.title} - ${episode}`, `Episode #${episode} just got uploaded`);
                await utils.sendDiscordWebhook({ item, episode, title: anime.title, slug: anime.slug });
            }
        }
    });

    rss.on("feed:error", (error: FeedError) => utils.handleException(error));

    client.on("ready", () => {
        console.log(`Logged in as ${client.user.username}`);
        client.editStatus("online", { name: "waiting for anime to release" });
    });

    client.on("error", (error: Error) => utils.handleException(error));

    process.on("SIGINT", () => { // Disconnect from discord when exiting
        client.disconnect({ reconnect: false });
        process.exit(0);
    });

    await client.connect();
}

main().catch((error) => utils.handleException(error));
