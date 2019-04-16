import * as Sentry from "@sentry/node";
import os from "os";
import path from "path";
import TurndownService from "turndown";
import PushNotifications from "@pusher/push-notifications-server";
import { Client } from "eris";
import { promises as fs } from "fs";
import { Notification, ItemContext, Settings, Options } from "./Interfaces";
import { FeedError } from "rss-emitter-ts";

export default class Utils {
    public client: Client;
    public settings: Settings;
    public turndown: TurndownService;
    public beams: PushNotifications;

    public constructor(options: Options) {
        this.client = options.client;
        this.settings = options.settings;
        this.turndown = options.turndown;
        this.beams = options.beams;
    }

    /**
     * Handle all exceptions
     */
    public handleException(exception: any): void {
        const user = os.userInfo();
        const ips = this._ips();

        Sentry.withScope((scope) => {
            scope.setUser({
                id: user.uid.toString(),
                ip_address: ips.length ? ips[0] : "unkown",
                username: user.username
            });

            if (exception instanceof FeedError) {
                const error = exception as FeedError;
                scope.setExtras({ "feed": error.feed, "type": error.type, "name": error.constructor.name });
                scope.setTag("type", error.type);
                Sentry.captureException(error);
            } else {
                scope.setExtra("name", exception.constructor.name);
                scope.setTag("type", "generic_error");
                Sentry.captureException(exception);
            }
        });
    }

    /**
     * Async wrapper for forEach
     */
    public async foreachAsync(a: ArrayLike<any>, cb: Function): Promise<void> {
        for (let i = 0; i < a.length; i++) {
            await cb(a[i], i, a);
        }
    }

    /**
     * Increment notification number
     */
    public async incrementId(): Promise<number> {
        const json = await fs.readFile(path.join(__dirname, "..", "notificationId.json"), { encoding: "utf8" });

        let notification: Notification = JSON.parse(json);
        notification.id++;

        // ID 999 is reserved for the default notification when launching the app 51.4916391 3.8231764
        if (notification.id === 999)
            notification.id++;

        await fs.writeFile(path.join(__dirname, "..", "notificationId.json"), JSON.stringify(notification), { encoding: "utf8" });

        return notification.id;
    }

    /**
     * Send a push notification
     */
    public async sendPushNotification(title: string, body: string): Promise<void> {
        const notificationId = await this.incrementId();
        await this.beams.publishToInterests(["anime.new"], {
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
    }

    /**
     * Execute a discord webhook
     */
    public async sendDiscordWebhook(ctx: ItemContext): Promise<void> {
        const description = this.turndown.turndown(ctx.item.description).split("|");
        const urls = description.splice(0, 2);

        const feeditem = ctx.item as any;
        await this.client.executeWebhook(this.settings.webhook.id, this.settings.webhook.token, {
            username: this.client.user.username,
            avatarURL: this.client.user.dynamicAvatarURL("png", 512),
            embeds: [
                {
                    title: `${ctx.title} #${ctx.title}`,
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
                    timestamp: ctx.item.pubdate ? ctx.item.pubdate.toISOString() : ""
                }
            ]
        });
    }

    /**
     * Get ip addresses
     */
    private _ips(): string[] {
        return (Object.values(os.networkInterfaces()).reduce((r, list) => r.concat(list.reduce((pv: any, cv) => pv.concat(cv.family === "IPv4" && !cv.internal && cv.address || []), [])), []) as any[]);
    }
}
