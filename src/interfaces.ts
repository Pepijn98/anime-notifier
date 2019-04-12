interface Notification {
    id: number;
}

interface ItemContext {
    title: string;
    slug: string;
    episode: string;
}

interface Anime {
    title: string;
    slug: string;
}

interface Rss {
    url: string;
    ignoreFirst: boolean;
    refresh: number;
}

interface Beams {
    instanceId: string;
    secretKey: string;
}

interface Webhook {
    id: string;
    token: string;
}

interface Settings {
    token: string;
    anime: Anime[];
    rss: Rss;
    beams: Beams;
    webhook: Webhook;
}

export {
    Notification,
    ItemContext,
    Anime,
    Rss,
    Beams,
    Settings
}