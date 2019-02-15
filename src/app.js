#!/usr/bin/env node

const notifier = require("node-notifier");
const Kitsu = require("kitsu");
const Rss = require("rss-emitter-ts");

/**
 * Remove horriblesubs and any other stuff from the title
 *
 * @param {string} str The string to strip the horriblsubs garbage from
 * @returns {Promise<string>} returns the stripped string
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
 * @param {Iterable} a The array to iterate over
 * @param {Function} cb An async callback function
 */
const foreachAsync = async (a, cb) => {
    for (let i = 0; i < a.length; i++)
        await cb(a[i], i, a);
};

/**
 * Main function (using it this way because nodejs does not allow top-level await)
 *
 * @returns {Promise<void>}
 */
async function main() {
    const kitsu = new Kitsu();

    // Fetch user info to get the userId
    const users = await kitsu.get("users", { filter: { name: "Kurozero" } });

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
    const rss = new Rss.FeedEmitter();
    rss.add({ url: "https://nyaa.si/?page=rss&u=HorribleSubs&q=1080", ignoreFirst: true, refresh: 10000 });

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

            // Temporary debug logs to see if what I did works
            // console.log(`title: ${title}`);
            // console.log(`kitsuTitle: ${kitsuTitle}`);
            // console.log(`episode: ${episode}`);
            // console.log(`animeTitle: ${animeTitle}`);

            // Notification message should look like:
            // <anime_name> episode #<episode_num> just aired
            // <url_to_new_episode>
            notifier.notify({
                title: "Anime Notifier",
                message: `${animeTitle} episode #${episode} just aired\nhttps://horriblesubs.info/shows/${title}#${episode}`
            });
        }
    });

    rss.on("feed:error", (error) => console.error(error.message));
}

main()
    .then(() => console.log("Started!"))
    .catch(console.error);
