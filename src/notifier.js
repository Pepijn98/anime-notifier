#!/usr/bin/env node

const PushNotifications = require("@pusher/push-notifications-server");
const Rss = require("rss-emitter-ts");
const toml = require("toml");
const project = require("../package.json");
const { promisifyAll } = require("tsubaki");
const { readFileAsync, writeFileAsync } = promisifyAll(require("fs"));
const { join } = require("path");

/**
 * @typedef {Object} Anime
 * @property {string} title
 * @property {string} slug
 */

/**
 * Settings type definition
 * @typedef {Object} Settings
 * @property {Array<Anime>}     anime                - A list of anime I'm currently watching
 * @property {Object}           rss                  - Rss settings
 * @property {string}           rss.url              - Rss feed url
 * @property {boolean}          rss.ignoreFirst      - Ignore first few items when initialized
 * @property {number}           rss.refresh          - Refresh rate to check for new items
 * @property {Object}           beams                - Beams push notification settings
 * @property {string}           beams.instanceId     - Beams instance id
 * @property {string}           beams.secretKey      - Beams secret key
 */

/**
 * Async wrapper for forEach
 * @param {Iterable} a - The array to iterate over
 * @param {Function} cb - An async callback function
 * @returns {Promise<void>}
 */
const foreachAsync = async (a, cb) => {
    for (let i = 0; i < a.length; i++)
        await cb(a[i], i, a);
};

/**
 * Send a push notification
 * @param {PushNotifications} client - The beams client
 * @param {string} title - Notification title
 * @param {string} body - Notification body
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
        console.error(error);
    }
};

/**
 * Main function (using it this way because nodejs does not allow top-level await)
 * @returns {Promise<void>}
 */
async function main() {
    const str = await readFileAsync(join(__dirname, "..", "settings.toml"), { encoding: "utf8" });
    /** @type {Settings} */
    const settings = toml.parse(str);
    const userAgent = `${project.name}/v${project.version} (${project.repository.url.replace(".git", "")})`;

    // Initiate the beams client
    const beams = new PushNotifications({
        instanceId: settings.beams.instanceId,
        secretKey: settings.beams.secretKey
    });

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
        let original = "";
        let index = 0;

        await foreachAsync(settings.anime, async (anime) => {
            original = item.title;
            const check = item.title.toLowerCase().replace(/ /g, "-").replace(/---/g, "-");
            if (check.indexOf(anime.slug) !== -1) {
                title = anime.title;
                watching = true;

                if (anime.slug.indexOf("date-a-live") !== -1) {
                    index = 1;
                } else if (anime.slug.indexOf("mob-psycho") !== -1) {
                    index = 2;
                }
            }
        });

        if (watching) {
            const numbers = original.match(/\d+/);
            let episode = "";
            if (numbers) {
                episode = numbers[index] ? numbers[index] : "00";
            } else {
                episode = "00";
            }

            await sendPushNotification(beams, `${title} - ${episode}`, `Episode #${episode} just got uploaded to horriblesubs`);
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
