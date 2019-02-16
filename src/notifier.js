#!/usr/bin/env node

const PushNotifications = require("@pusher/push-notifications-server");
const Kitsu = require("kitsu");
const Rss = require("rss-emitter-ts");
const toml = require("toml");
const { promisifyAll } = require("tsubaki");
const { readFileAsync, writeFileAsync } = promisifyAll(require("fs"));
const { join } = require("path");

/**
 * Settings type definition
 * @typedef {Object} Settings
 * @property {string}  name                 - Project name
 * @property {string}  version              - Project version
 * @property {string}  repo                 - Project repo
 * @property {Object}  kitsu                - Kitsu settings
 * @property {string}  kitsu.username       - Kitsu username
 * @property {Object}  rss                  - Rss settings
 * @property {string}  rss.url              - Rss feed url
 * @property {boolean} rss.ignoreFirst      - Ignore first few items when initialized
 * @property {number}  rss.refresh          - Refresh rate to check for new items
 * @property {Object}  beams                - Beams push notification settings
 * @property {string}  beams.instanceId     - Beams instance id
 * @property {string}  beams.secretKey      - Beams secret key
 */

/**
 * Remove horriblesubs and any other stuff from the title
 *
 * @param {string} str - The string to strip the horriblsubs garbage from
 *
 * @returns {Promise<string>} - returns the stripped string
 */
const stripHorriblesubs = (str) => {
    return new Promise((resolve, reject) => {
        try {
            let stripped = str.replace("[HorribleSubs] ", "")
                .replace(/ - \d{2} \[\d{4}p\]\.mkv/, "");
            resolve(stripped);
        } catch (e) {
            reject(e);
        }
    });
};

/**
 * Async wrapper for forEach
 *
 * @param {Iterable} a - The array to iterate over
 * @param {Function} cb - An async callback function
 *
 * @returns {Promise<void>}
 */
const foreachAsync = async (a, cb) => {
    for (let i = 0; i < a.length; i++)
        await cb(a[i], i, a);
};

/**
 * Send a push notification
 *
 * @param {PushNotifications} client - The beams client
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 *
 * @returns {Promise<PushNotifications.PublishResponse>}
 */
const sendPushNotification = async (client, title, body) => {
    try {
        let json = await readFileAsync(join(__dirname, "notificationId.json"), { encoding: "utf8" });
        json = JSON.parse(json);
        json.notificationId++;

        // ID 999 is reserved for the default notification when launching the app
        if (json.notificationId === 999)
            json.notificationId++;

        await writeFileAsync(join(__dirname, "notificationId.json"), JSON.stringify(json), { encoding: "utf8" });

        return await client.publishToInterests(["anime.new"], {
            fcm: {
                notification: {
                    title,
                    body
                },
                data: {
                    notificationId: json.notificationId
                }
            }
        });
    } catch (error) {
        throw error;
    }
};

/**
 * Main function (using it this way because nodejs does not allow top-level await)
 *
 * @returns {Promise<void>}
 */
async function main() {
    const str = await readFileAsync(join(__dirname, "..", "settings.toml"), { encoding: "utf8" });
    /** @type {Settings} */ const settings = toml.parse(str);
    const userAgent = `${settings.name}/v${settings.version} (${settings.repo})`;

    // Initiate the beams client
    const beams = new PushNotifications({
        instanceId: settings.beams.instanceId,
        secretKey: settings.beams.secretKey
    });

    // Initiate the kitsu client
    const kitsu = new Kitsu({
        headers: {
            "User-Agent": userAgent
        }
    });

    // Fetch user info to get the userId
    const users = await kitsu.get("users", {
        filter: {
            name: settings.kitsu.username
        }
    });

    // Fetch currently watching anime
    const library = await kitsu.get("library-entries", {
        fields: {
            anime: "slug,canonicalTitle,titles",
            users: "id"
        },
        filter: {
            kind: "anime",
            status: "current",
            userId: users.data[0].id
        },
        include: "anime,user",
        page: {
            offset: 0,
            limit: 40
        }
    });

    // Push titles to array
    let airing = [];
    for (let entry of library.data) {
        airing.push({
            slug: entry.anime.slug,
            title: entry.anime.canonicalTitle || entry.anime.titles ? entry.anime.titles.en_jp || entry.anime.titles.en : entry.anime.slug
        });
    }

    // Create rss feed emitter and add nyaa's feed for horriblesubs
    const rss = new Rss.FeedEmitter({ userAgent });
    rss.add({
        url: settings.rss.url,
        ignoreFirst: settings.rss.ignoreFirst,
        refresh: settings.rss.refresh
    });

    rss.on("item:new", async (item) => {
        let watching = false;
        let title = "";
        let kitsuTitle = "";
        let notStripped = "";
        let animeTitle = "";

        await foreachAsync(airing, async (anime) => {
            notStripped = item.title;
            let stripped = await stripHorriblesubs(item.title);
            title = stripped.toLowerCase().replace(/ /g, "-").replace(/---/g, "-");
            kitsuTitle = title.replace("s3", "III"); // Kitsu uses III, horriblesubs uses S3, good shit
            if (anime.slug.indexOf(kitsuTitle) !== -1) {
                animeTitle = anime.title;
                watching = true;
            }
        });

        if (watching) {
            const numbers = notStripped.match(/\d+/);
            let episode = "";
            if (item.title.indexOf("Date A Live") !== -1)
                episode = numbers ? numbers[1] : "00";
            else
                episode = numbers ? numbers[0] : "00";

            await sendPushNotification(beams, animeTitle, `Episode #${episode} just got uploaded to horriblesubs`);
        }
    });

    rss.on("feed:error", (error) => console.error(error.message));
}

main()
    .then(() => console.log("Started!"))
    .catch(console.error);

// Quick access to some commands I always forget
// sudo systemctl daemon-reload
// sudo systemctl reload-or-restart anime-notifier.service
// sudo journalctl -f -u anime-notifier
