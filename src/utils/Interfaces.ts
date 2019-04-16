import TurndownService from "turndown";
import PushNotifications from "@pusher/push-notifications-server";
import { Client } from "eris";
import { FeedItem } from "rss-emitter-ts";

export interface Notification {
    id: number;
}

export interface ItemContext {
    item: FeedItem;
    title: string;
    slug: string;
    episode: string;
}

export interface Anime {
    title: string;
    slug: string;
}

export interface Rss {
    url: string;
    ignoreFirst: boolean;
    refresh: number;
}

export interface Beams {
    instanceId: string;
    secretKey: string;
}

export interface Webhook {
    id: string;
    token: string;
}

export interface Tokens {
    production: string;
    development: string;
}

export interface Settings {
    env: string;
    dsn: string;
    tokens: Tokens;
    anime: Anime[];
    rss: Rss;
    beams: Beams;
    webhook: Webhook;
}

export interface Options {
    client: Client;
    settings: Settings;
    turndown: TurndownService;
    beams: PushNotifications;
}
