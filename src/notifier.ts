#!/usr/bin/env ts-node

import { FeedItem, FeedEmitter, FeedError } from "rss-emitter-ts";
import { Notification, Settings, Anime, ItemContext } from "./interfaces";
import { promises as fs } from "fs";
import PushNotifications from "@pusher/push-notifications-server";
import path from "path";
import { Client } from "eris";
import TOML from "toml";
import Bluebird from "bluebird";
import TurndownService from "turndown";
import project from "../package.json";

global.Promise = Bluebird;

const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*"
});

turndown.addRule("cite", {
    filter: ["cite"],
    replacement: (content: string) => `*${content}*`
});

/**
 * Async wrapper for forEach
 */
const foreachAsync = async (a: ArrayLike<any>, cb: Function): Promise<void> => {
    for (let i = 0; i < a.length; i++)
        await cb(a[i], i, a);
};

/**
 * Increment notification number
 */
const incrementId = async (): Promise<number> => {
    const json = await fs.readFile(path.join(__dirname, "notificationId.json"), { encoding: "utf8" });

    let notification: Notification = JSON.parse(json);
    notification.id++;

    // ID 999 is reserved for the default notification when launching the app
    if (notification.id === 999)
        notification.id++;

    await fs.writeFile(path.join(__dirname, "notificationId.json"), JSON.stringify(notification), { encoding: "utf8" });

    return notification.id;
};

/**
 * Remove unnecessary stuff from the title
 */
const stripHorriblesubs = (str: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        try {
            let stripped = str.replace("[HorribleSubs] ", "").replace(/ \[\d{4}p\]\.mkv/, "");
            resolve(stripped);
        } catch (e) {
            reject(e);
        }
    });
};

/**
 * Send a push notification
 */
const sendPushNotification = async (client: PushNotifications, title: string, body: string): Promise<void> => {
    const notificationId = await incrementId();
    await client.publishToInterests(["anime.new"], {
        fcm: {
            notification: {
                title,
                body
            },
            data: {
                notificationId
            }
        }
    });
};

const sendDiscordWebhook = async (client: Client, item: FeedItem, settings: Settings, ctx: ItemContext) => {
    const description = turndown.turndown(item.description).split("|");
    const urls = description.splice(0, 2);

    const feeditem = item as any;
    await client.executeWebhook(settings.webhook.id, settings.webhook.token, {
        username: client.user.username,
        avatarURL: client.user.dynamicAvatarURL("png", 512),
        embeds: [
            {
                title: ctx.title,
                url: `https://horriblesubs.info/shows/${ctx.slug}/#${ctx.episode}`,
                description: `${urls.join("|")}\n${description.join("\n")}`,
                color: 0xDC143C,
                fields: [
                    {
                        name: "Seeders",
                        value: feeditem["nyaa:seeders"]["#"],
                        inline: true
                    },
                    {
                        name: "Leechers",
                        value: feeditem["nyaa:leechers"]["#"],
                        inline: true
                    },
                    {
                        name: "Downloads",
                        value: feeditem["nyaa:downloads"]["#"],
                        inline: true
                    }
                ],
                timestamp: item.pubdate ? item.pubdate.toISOString() : ""
            }
        ]
    });
};

/**
 * Main function (using it this way because nodejs does not allow top-level await)
 */
async function main(): Promise<void> {
    const toml = await fs.readFile(path.join(__dirname, "..", "settings.toml"), { encoding: "utf8" });
    const settings: Settings = TOML.parse(toml);
    const client = new Client(settings.token);
    const userAgent = `${project.name}/v${project.version} (${project.repository.url.replace(".git", "")})`;
    const beams = new PushNotifications({ instanceId: settings.beams.instanceId, secretKey: settings.beams.secretKey });
    const rss = new FeedEmitter({ userAgent });
    rss.add({ url: settings.rss.url, ignoreFirst: settings.rss.ignoreFirst, refresh: settings.rss.refresh });

    rss.on("item:new", async (item: FeedItem) => {
        let watching = false;
        let title = "";
        let slug = "";
        let original = "";
        let index = 0;

        await foreachAsync(settings.anime, async (anime: Anime) => {
            original = item.title;
            const check = item.title.toLowerCase().replace(/ /g, "-").replace(/---/g, "-");
            if (check.indexOf(anime.slug) !== -1) {
                title = anime.title;
                slug = anime.slug;
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

            await sendPushNotification(beams, `${title} - ${episode}`, `Episode #${episode} just got uploaded`);
            await sendDiscordWebhook(client, item, settings, { title, slug, episode });
        }
    });

    rss.on("feed:error", (error: FeedError) => console.error(error.message));
}

main()
    .then(() => console.log("Started!"))
    .catch(console.error);

// Quick access to some commands I always forget
// sudo systemctl daemon-reload
// sudo systemctl reload-or-restart anime-notifier.service
// sudo journalctl -f -u anime-notifier
