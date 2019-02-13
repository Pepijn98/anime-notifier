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
        airing.push(entry.anime.slug);
    }

    // Create rss feed emitter and add nyaa's feed for horriblesubs
    const rss = new Rss.FeedEmitter();
    rss.add({ url: "https://nyaa.si/?page=rss&u=HorribleSubs&q=1080", ignoreFirst: true, refresh: 10000 });

    rss.on("item:new", async (item) => {
        let watching = false;
        let title = "";
        let kitsuTitle = "";
        airing.forEach((anime) => {
            let stripped = stripHorriblesubs(item.title);
            title = stripped.toLowerCase().replace(/ /g, "-").replace(/---/g, "-");
            kitsuTitle = title.replace("s3", "III"); // Kitsu uses III, horriblesubs uses S3, good shit
            if (anime.indexOf(kitsuTitle) !== -1) {
                watching = true;
            }
        });

        if (watching) {
            const episode = kitsuTitle.match(/\d+/)[0];
            const anime = await kitsu.get("anime", {
                filters: {
                    slug: kitsuTitle
                }
            });
            const animeTitle = anime.data[0].canonicalTitle || anime.data[0].titles ? anime.data[0].titles.en_jp || anime.data[0].titles.en : title;

            // Temporary debug logs to see if what I did works
            console.log(`title: ${title}`);
            console.log(`kitsuTitle: ${kitsuTitle}`);
            console.log(`episode: ${episode}`);
            console.log(`animeTitle: ${animeTitle}`);

            notifier.notify({
                title: "Anime Notifier",
                message: `${animeTitle} episode #${episode} just aired\nhttps://horriblesubs.info/shows/${title}#${episode}` // <anime_name> episode #<episode_num> just aired
            });
        }
    });

    rss.on("feed:error", (error) => console.error(error.message));
}

main()
    .then(() => console.log("Started!"))
    .catch(console.error);
