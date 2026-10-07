const express = require("express");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
const parseTorrent = require("parse-torrent-file");

const app = express();
const PORT = process.env.PORT || 10000;

const VERSION = "3.0.0";

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// --------------------------------------------------
// CORS
// --------------------------------------------------

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// --------------------------------------------------
// SUPABASE
// --------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// --------------------------------------------------
// MULTER
// --------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

// --------------------------------------------------
// HOME
// --------------------------------------------------

app.get("/", (req, res) => {
  res.type("text").send(
    `My Favorites Stremio Addon is running!\nVersion: ${VERSION}\nDirect video URLs and authorized torrent streams are supported.`
  );
});

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    service: "my-favorites-stremio-addon"
  });
});

// --------------------------------------------------
// MAGNET PARSER
// --------------------------------------------------

function parseMagnet(magnet) {
  if (!magnet || typeof magnet !== "string") {
    throw new Error("Magnet link is empty");
  }

  const match = magnet.match(
    /xt=urn:btih:([a-zA-Z0-9]+)/
  );

  if (!match) {
    throw new Error("Invalid magnet link");
  }

  return {
    torrentType: "magnet",
    torrentData: magnet.trim(),
    infoHash: match[1].toLowerCase()
  };
}

// --------------------------------------------------
// TORRENT FILE PARSER
// --------------------------------------------------

function parseTorrentBuffer(buffer) {
  if (!buffer || !buffer.length) {
    throw new Error("Torrent file is empty");
  }

  const parsed = parseTorrent(buffer);

  if (!parsed || !parsed.infoHash) {
    throw new Error("Could not read torrent info hash");
  }

  return {
    torrentType: "torrent",
    torrentData: buffer.toString("base64"),
    infoHash: parsed.infoHash.toLowerCase()
  };
}

// --------------------------------------------------
// ADMIN PAGE
// --------------------------------------------------

app.get("/admin", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>My Favorites Admin</title>

<style>
body {
  font-family: Arial, sans-serif;
  max-width: 850px;
  margin: 30px auto;
  padding: 20px;
  background: #111;
  color: #fff;
}

h1 {
  margin-bottom: 5px;
}

.section {
  border: 1px solid #333;
  border-radius: 12px;
  padding: 20px;
  margin-top: 20px;
}

input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  margin: 7px 0 15px;
  border-radius: 8px;
  border: 1px solid #444;
  background: #222;
  color: white;
}

button {
  padding: 13px 22px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  background: #fff;
  color: #000;
  font-weight: bold;
}

.small {
  color: #aaa;
  font-size: 13px;
}
</style>
</head>

<body>

<h1>My Favorites</h1>
<div class="small">Addon version ${VERSION}</div>

<form
  action="/admin/add"
  method="POST"
  enctype="multipart/form-data"
>

<div class="section">

<h2>Movie</h2>

<label>Movie title</label>
<input
  type="text"
  name="title"
  placeholder="Example: My Movie"
  required
>

<label>Poster URL</label>
<input
  type="url"
  name="poster"
  placeholder="https://..."
>

</div>

<div class="section">

<h2>1080p</h2>

<label>Direct video URL</label>
<input
  type="url"
  name="url1080"
  placeholder="https://example.com/video.mp4"
>

<label>Magnet link</label>
<input
  type="text"
  name="magnet1080"
  placeholder="magnet:?xt=urn:btih:..."
>

<label>.torrent file</label>
<input
  type="file"
  name="torrent1080"
  accept=".torrent"
>

</div>

<div class="section">

<h2>4K</h2>

<label>Direct video URL</label>
<input
  type="url"
  name="url4k"
  placeholder="https://example.com/video.mp4"
>

<label>Magnet link</label>
<input
  type="text"
  name="magnet4k"
  placeholder="magnet:?xt=urn:btih:..."
>

<label>.torrent file</label>
<input
  type="file"
  name="torrent4k"
  accept=".torrent"
>

</div>

<div class="section">

<button type="submit">
Add Movie
</button>

</div>

</form>

</body>
</html>
`);
});

// --------------------------------------------------
// ADMIN ADD MOVIE
// --------------------------------------------------

app.post(
  "/admin/add",
  upload.fields([
    { name: "torrent1080", maxCount: 1 },
    { name: "torrent4k", maxCount: 1 }
  ]),
  async (req, res) => {

    try {

      const title = (req.body.title || "").trim();
      const poster = (req.body.poster || "").trim();

      if (!title) {
        return res.status(400).send("Movie title is required");
      }

      const streams = [];

      // --------------------------------------------
      // 1080P DIRECT
      // --------------------------------------------

      if (req.body.url1080 && req.body.url1080.trim()) {

        streams.push({
          quality: "1080p",
          torrentType: null,
          torrentData: null,
          infoHash: null,
          streamUrl: req.body.url1080.trim()
        });

      }

      // --------------------------------------------
      // 1080P MAGNET
      // --------------------------------------------

      if (
        req.body.magnet1080 &&
        req.body.magnet1080.trim()
      ) {

        const torrent = parseMagnet(
          req.body.magnet1080.trim()
        );

        streams.push({
          quality: "1080p",
          torrentType: torrent.torrentType,
          torrentData: torrent.torrentData,
          infoHash: torrent.infoHash,
          streamUrl: null
        });

      }

      // --------------------------------------------
      // 1080P TORRENT FILE
      // --------------------------------------------

      const torrent1080 =
        req.files &&
        req.files.torrent1080 &&
        req.files.torrent1080[0];

      if (torrent1080) {

        const torrent = parseTorrentBuffer(
          torrent1080.buffer
        );

        streams.push({
          quality: "1080p",
          torrentType: torrent.torrentType,
          torrentData: torrent.torrentData,
          infoHash: torrent.infoHash,
          streamUrl: null
        });

      }

      // --------------------------------------------
      // 4K DIRECT
      // --------------------------------------------

      if (req.body.url4k && req.body.url4k.trim()) {

        streams.push({
          quality: "4K",
          torrentType: null,
          torrentData: null,
          infoHash: null,
          streamUrl: req.body.url4k.trim()
        });

      }

      // --------------------------------------------
      // 4K MAGNET
      // --------------------------------------------

      if (
        req.body.magnet4k &&
        req.body.magnet4k.trim()
      ) {

        const torrent = parseMagnet(
          req.body.magnet4k.trim()
        );

        streams.push({
          quality: "4K",
          torrentType: torrent.torrentType,
          torrentData: torrent.torrentData,
          infoHash: torrent.infoHash,
          streamUrl: null
        });

      }

      // --------------------------------------------
      // 4K TORRENT FILE
      // --------------------------------------------

      const torrent4k =
        req.files &&
        req.files.torrent4k &&
        req.files.torrent4k[0];

      if (torrent4k) {

        const torrent = parseTorrentBuffer(
          torrent4k.buffer
        );

        streams.push({
          quality: "4K",
          torrentType: torrent.torrentType,
          torrentData: torrent.torrentData,
          infoHash: torrent.infoHash,
          streamUrl: null
        });

      }

      if (streams.length === 0) {
        return res.status(400).send(
          "Add at least one direct URL, magnet, or .torrent file."
        );
      }

      // --------------------------------------------
      // CREATE MOVIE
      // --------------------------------------------

      const { data: movie, error: movieError } =
        await supabase
          .from("movies")
          .insert({
            title: title,
            poster_url: poster || null,
            stream_url: null
          })
          .select()
          .single();

      if (movieError) {
        console.error(movieError);

        return res.status(500).send(
          "Movie insert failed: " +
          movieError.message
        );
      }

      // --------------------------------------------
      // CREATE STREAMS
      // --------------------------------------------

      const rows = streams.map(stream => ({
        movie_id: movie.id,
        quality: stream.quality,
        torrent_type: stream.torrentType,
        torrent_data: stream.torrentData,
        info_hash: stream.infoHash,
        stream_url: stream.streamUrl
      }));

      const { error: streamError } =
        await supabase
          .from("movie_streams")
          .insert(rows);

      if (streamError) {

        console.error(streamError);

        return res.status(500).send(
          "Stream insert failed: " +
          streamError.message
        );

      }

      res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Added</title>
<style>
body {
  background:#111;
  color:white;
  font-family:Arial;
  padding:40px;
}
a {
  color:#fff;
}
</style>
</head>

<body>

<h1>Movie added successfully</h1>

<p>
<strong>${escapeHtml(title)}</strong>
</p>

<p>
Movie ID:
<strong>${movie.id}</strong>
</p>

<p>
Streams added:
<strong>${streams.length}</strong>
</p>

<p>
<a href="/admin">Add another movie</a>
</p>

</body>
</html>
`);

    } catch (error) {

      console.error(
        "ADMIN ADD ERROR:",
        error
      );

      res.status(500).send(
        "Error: " + error.message
      );
    }
  }
);

// --------------------------------------------------
// HTML ESCAPE
// --------------------------------------------------

function escapeHtml(value) {

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --------------------------------------------------
// STREMIO MANIFEST
// --------------------------------------------------

app.get("/manifest.json", (req, res) => {

  res.json({
    id: "com.cinemavault.myfavorites",

    version: VERSION,

    name: "My Favorites",

    description:
      "Personal Stremio addon for authorized media.",

    resources: [
      "catalog",
      "meta",
      "stream"
    ],

    types: [
      "movie"
    ],

    catalogs: [
      {
        type: "movie",
        id: "my-favorites",
        name: "My Favorites",
        extra: []
      }
    ],

    behaviorHints: {
      p2p: true
    }
  });

});

// --------------------------------------------------
// CATALOG
// --------------------------------------------------

app.get(
  "/catalog/movie/my-favorites.json",
  async (req, res) => {

    try {

      const { data, error } =
        await supabase
          .from("movies")
          .select(
            "id,title,poster_url,created_at"
          )
          .order(
            "created_at",
            { ascending: false }
          );

      if (error) {

        console.error(
          "CATALOG ERROR:",
          error
        );

        return res.json({
          metas: []
        });
      }

      const metas = (data || []).map(movie => ({

        id: `movie-${movie.id}`,

        type: "movie",

        name: movie.title,

        poster: movie.poster_url || undefined

      }));

      res.json({
        metas
      });

    } catch (error) {

      console.error(error);

      res.json({
        metas: []
      });

    }

  }
);

// --------------------------------------------------
// META
// --------------------------------------------------

app.get(
  "/meta/movie/:id.json",
  async (req, res) => {

    try {

      let id = req.params.id;

      if (id.startsWith("movie-")) {
        id = id.substring(6);
      }

      const movieId = Number(id);

      if (!Number.isInteger(movieId)) {
        return res.status(400).json({});
      }

      const { data, error } =
        await supabase
          .from("movies")
          .select("*")
          .eq("id", movieId)
          .single();

      if (error || !data) {

        return res.status(404).json({});
      }

      res.json({

        meta: {

          id: `movie-${data.id}`,

          type: "movie",

          name: data.title,

          poster: data.poster_url || undefined

        }

      });

    } catch (error) {

      console.error(
        "META ERROR:",
        error
      );

      res.status(500).json({});

    }

  }
);

// --------------------------------------------------
// STREAM
// --------------------------------------------------

app.get(
  "/stream/movie-:id.json",
  async (req, res) => {

    console.log("STREAM REQUEST:", req.originalUrl);

    try {

      const movieId = Number(req.params.id);

      console.log("MOVIE ID:", movieId);

      if (!Number.isInteger(movieId)) {
        return res.json({
          streams: []
        });
      }

      const {
        data: streamRows,
        error: streamError
      } = await supabase
        .from("movie_streams")
        .select(
          "id,movie_id,quality,torrent_type,torrent_data,info_hash,stream_url"
        )
        .eq("movie_id", movieId)
        .order("quality", {
          ascending: false
        });

      if (streamError) {

        console.error(
          "SUPABASE STREAM ERROR:",
          streamError
        );

        return res.json({
          streams: []
        });
      }

      console.log(
        "STREAM ROWS:",
        streamRows
      );

      const streams = [];

      for (const stream of streamRows || []) {

        // Direct video URL
        if (
          typeof stream.stream_url === "string" &&
          stream.stream_url.trim()
        ) {

          streams.push({
            name: stream.quality,

            title:
              `${stream.quality} • Direct`,

            description:
              `${stream.quality} • Direct Stream`,

            url:
              stream.stream_url.trim(),

            behaviorHints: {
              bingeGroup:
                `myfavorites-${stream.quality}`
            }
          });

          continue;
        }

        // Torrent / magnet
        if (
          typeof stream.info_hash === "string" &&
          stream.info_hash.trim()
        ) {

          streams.push({
            name: stream.quality,

            title:
              `${stream.quality} • Torrent`,

            description:
              `${stream.quality} • Torrent`,

            infoHash:
              stream.info_hash.trim(),

            type: "torrent",

            behaviorHints: {
              bingeGroup:
                `myfavorites-${stream.quality}`
            }
          });

        }

      }

      console.log(
        "FINAL STREAMS:",
        streams
      );

      return res.json({
        streams
      });

    } catch (error) {

      console.error(
        "STREAM ERROR:",
        error
      );

      return res.json({
        streams: []
      });

    }

  }
);
      // ------------------------------------------
      // GET STREAMS
      // ------------------------------------------

      const {
        data: streamRows,
        error: streamError
      } = await supabase
        .from("movie_streams")
        .select(
          "id,movie_id,quality,torrent_type,torrent_data,info_hash,stream_url"
        )
        .eq(
          "movie_id",
          movieId
        )
        .order(
          "quality",
          { ascending: false }
        );

      if (streamError) {

        console.error(
          "STREAM DATABASE ERROR:",
          streamError
        );

        return res.json({
          streams: []
        });

      }

      console.log(
        "STREAM ROWS:",
        streamRows
      );

      // ------------------------------------------
      // CONVERT TO STREMIO STREAMS
      // ------------------------------------------

      const streams = [];

      for (const stream of streamRows || []) {

        // DIRECT VIDEO
        if (
          typeof stream.stream_url === "string" &&
          stream.stream_url.trim()
        ) {

          streams.push({

            name: stream.quality,

            title:
              `${stream.quality} • Direct`,

            description:
              `${stream.quality} • Direct Stream`,

            url:
              stream.stream_url.trim(),

            behaviorHints: {

              bingeGroup:
                `myfavorites-${stream.quality}`

            }

          });

          continue;
        }

        // TORRENT
        if (
          typeof stream.info_hash === "string" &&
          stream.info_hash.trim()
        ) {

          streams.push({

            name: stream.quality,

            title:
              `${stream.quality} • Torrent`,

            description:
              `${stream.quality} • Torrent`,

            infoHash:
              stream.info_hash.trim(),

            type: "torrent",

            behaviorHints: {

              bingeGroup:
                `myfavorites-${stream.quality}`

            }

          });

        }

      }

      console.log(
        "STREAM RESULT:",
        streams
      );

      return res.json({
        streams
      });

    } catch (error) {

      console.error(
        "STREAM ERROR:",
        error
      );

      return res.json({
        streams: []
      });

    }

  }
);

// --------------------------------------------------
// 404 HANDLER
// --------------------------------------------------

app.use((req, res) => {

  res.status(404).json({

    error: "Not found",

    path: req.originalUrl,

    version: VERSION

  });

});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, () => {

  console.log(
    `My Favorites addon v${VERSION} running on port ${PORT}`
  );

});
