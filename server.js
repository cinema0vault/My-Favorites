const express = require("express");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
const parseTorrent = require("parse-torrent-file");

const app = express();
const PORT = process.env.PORT || 10000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

// =====================================================
// CORS
// =====================================================

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// =====================================================
// SUPABASE
// =====================================================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {
  res.send("My Favorites Stremio Addon is running!");
});

// =====================================================
// ADMIN PAGE
// =====================================================

app.get("/admin", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<title>My Favorites Manager</title>

<style>

* {
  box-sizing: border-box;
}

body {
  font-family: Arial, sans-serif;
  max-width: 760px;
  margin: 0 auto;
  padding: 25px;
  background: #111;
  color: white;
}

.box {
  background: #1c1c1c;
  padding: 25px;
  border-radius: 16px;
}

h1 {
  margin-top: 0;
}

h2 {
  margin-top: 30px;
}

label {
  display: block;
  margin-top: 18px;
  margin-bottom: 7px;
  font-weight: bold;
}

input,
button {
  width: 100%;
  padding: 13px;
  border-radius: 8px;
  border: 1px solid #444;
  font-size: 15px;
}

input {
  background: #292929;
  color: white;
}

button {
  margin-top: 25px;
  background: #20c76a;
  color: white;
  border: none;
  font-weight: bold;
  cursor: pointer;
}

button:hover {
  background: #18a958;
}

.version {
  margin-top: 20px;
  padding: 18px;
  border: 1px solid #333;
  border-radius: 12px;
}

.hint {
  color: #aaa;
  font-size: 13px;
}

</style>

</head>

<body>

<div class="box">

<h1>🎬 My Favorites</h1>

<form
  action="/admin/add"
  method="POST"
  enctype="multipart/form-data"
>

<label>Movie name</label>

<input
  type="text"
  name="title"
  placeholder="Movie name"
  required
>

<label>Poster URL</label>

<input
  type="url"
  name="poster_url"
  placeholder="https://example.com/poster.jpg"
>

<p class="hint">
Use a direct image URL ending in .jpg, .jpeg, .png or .webp.
</p>


<div class="version">

<h2>1080p</h2>

<label>1080p Magnet Link</label>

<input
  type="text"
  name="magnet1080"
  placeholder="magnet:?xt=urn:btih:..."
>

<label>OR 1080p .torrent</label>

<input
  type="file"
  name="torrent1080"
  accept=".torrent"
>

</div>


<div class="version">

<h2>4K</h2>

<label>4K Magnet Link</label>

<input
  type="text"
  name="magnet4k"
  placeholder="magnet:?xt=urn:btih:..."
>

<label>OR 4K .torrent</label>

<input
  type="file"
  name="torrent4k"
  accept=".torrent"
>

</div>


<button type="submit">
ADD MOVIE
</button>

</form>

</div>

</body>
</html>
  `);
});

// =====================================================
// PARSE TORRENT SOURCE
// =====================================================

function parseMagnet(magnet) {

  const match = magnet.match(
    /xt=urn:btih:([a-zA-Z0-9]+)/i
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


function parseTorrentFile(file) {

  if (
    !file.originalname
      .toLowerCase()
      .endsWith(".torrent")
  ) {
    throw new Error("Please upload a .torrent file");
  }

  const parsed = parseTorrent(file.buffer);

  if (!parsed.infoHash) {
    throw new Error(
      "Could not extract torrent info hash"
    );
  }

  return {
    torrentType: "torrent",
    torrentData: file.buffer.toString("base64"),
    infoHash: parsed.infoHash.toLowerCase()
  };
}

// =====================================================
// ADD MOVIE
// =====================================================

app.post(
  "/admin/add",
  upload.fields([
    {
      name: "torrent1080",
      maxCount: 1
    },
    {
      name: "torrent4k",
      maxCount: 1
    }
  ]),
  async (req, res) => {

    try {

      const {
        title,
        poster_url,
        magnet1080,
        magnet4k
      } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).send(
          "Movie title is required"
        );
      }

      const torrent1080 =
        req.files?.torrent1080?.[0] || null;

      const torrent4k =
        req.files?.torrent4k?.[0] || null;

      const streams = [];

      // =================================================
      // 1080p
      // =================================================

      if (
        (magnet1080 && magnet1080.trim()) ||
        torrent1080
      ) {

        try {

          let parsed;

          if (magnet1080 && magnet1080.trim()) {
            parsed = parseMagnet(magnet1080);
          } else {
            parsed = parseTorrentFile(torrent1080);
          }

          streams.push({
            quality: "1080p",
            ...parsed
          });

        } catch (error) {

          return res.status(400).send(
            "1080p error: " + error.message
          );

        }

      }

      // =================================================
      // 4K
      // =================================================

      if (
        (magnet4k && magnet4k.trim()) ||
        torrent4k
      ) {

        try {

          let parsed;

          if (magnet4k && magnet4k.trim()) {
            parsed = parseMagnet(magnet4k);
          } else {
            parsed = parseTorrentFile(torrent4k);
          }

          streams.push({
            quality: "4K",
            ...parsed
          });

        } catch (error) {

          return res.status(400).send(
            "4K error: " + error.message
          );

        }

      }

      if (streams.length === 0) {

        return res.status(400).send(
          "Add at least one 1080p or 4K torrent."
        );

      }

      // =================================================
      // CREATE MOVIE
      // =================================================

      const { data: movie, error: movieError } =
        await supabase
          .from("movies")
          .insert([
            {
              title: title.trim(),
              poster_url:
                poster_url?.trim() || null,
              stream_url: null,
              quality: "Multiple"
            }
          ])
          .select()
          .single();

      if (movieError) {

        console.error(
          "MOVIE INSERT ERROR:",
          movieError
        );

        return res.status(500).send(
          "Movie database error: " +
          movieError.message
        );

      }

      // =================================================
      // CREATE STREAMS
      // =================================================

      const streamRows = streams.map(stream => ({
        movie_id: movie.id,
        quality: stream.quality,
        torrent_type: stream.torrentType,
        torrent_data: stream.torrentData,
        info_hash: stream.infoHash
      }));

      const {
        data: insertedStreams,
        error: streamError
      } = await supabase
        .from("movie_streams")
        .insert(streamRows)
        .select();

      if (streamError) {

        console.error(
          "STREAM INSERT ERROR:",
          streamError
        );

        return res.status(500).send(
          "Stream database error: " +
          streamError.message
        );

      }

      // =================================================
      // SUCCESS
      // =================================================

      res.send(`
<!DOCTYPE html>

<html>

<head>

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<title>Movie Added</title>

<style>

body {
  font-family: Arial;
  max-width: 650px;
  margin: 40px auto;
  padding: 20px;
}

.box {
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 25px;
}

</style>

</head>

<body>

<div class="box">

<h2>✅ Movie added</h2>

<p>
<strong>Movie:</strong>
${escapeHtml(movie.title)}
</p>

<p>
<strong>Streams:</strong>
${insertedStreams.length}
</p>

${insertedStreams.map(stream => `
<p>
<strong>${escapeHtml(stream.quality)}</strong>
✓
</p>
`).join("")}

<p>
<strong>Poster:</strong>
${poster_url ? "✓ Added" : "Not provided"}
</p>

<br>

<a href="/admin">
← Add another movie
</a>

</div>

</body>

</html>
      `);

    } catch (error) {

      console.error(
        "ADMIN ERROR:",
        error
      );

      res.status(500).send(
        "Server error: " +
        error.message
      );

    }

  }
);

// =====================================================
// MANIFEST
// =====================================================

app.get("/manifest.json", (req, res) => {

  res.json({

    id: "com.cinemavault.myfavorites",

    version: "2.0.0",

    name: "My Favorites",

    description:
      "Personal Stremio addon",

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
        name: "My Favorites"
      }
    ],

    behaviorHints: {
      p2p: true
    }

  });

});

// =====================================================
// CATALOG
// =====================================================

app.get(
  "/catalog/movie/my-favorites.json",
  async (req, res) => {

    try {

      const { data, error } =
        await supabase
          .from("movies")
          .select(
            "id,title,poster_url"
          )
          .order(
            "created_at",
            {
              ascending: false
            }
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

      const metas = data.map(movie => ({

        id:
          `movie-${movie.id}`,

        type:
          "movie",

        name:
          movie.title,

        ...(movie.poster_url
          ? {
              poster:
                movie.poster_url
            }
          : {})

      }));

      res.json({
        metas
      });

    } catch (error) {

      console.error(
        "CATALOG ERROR:",
        error
      );

      res.json({
        metas: []
      });

    }

  }
);

// =====================================================
// META
// =====================================================

app.get(
  "/meta/movie/:id.json",
  async (req, res) => {

    try {

      const id =
        req.params.id.replace(
          "movie-",
          ""
        );

      const { data, error } =
        await supabase
          .from("movies")
          .select("*")
          .eq("id", id)
          .single();

      if (error || !data) {

        return res.status(404).json({
          error: "Movie not found"
        });

      }

      res.json({

        meta: {

          id:
            `movie-${data.id}`,

          type:
            "movie",

          name:
            data.title,

          ...(data.poster_url
            ? {
                poster:
                  data.poster_url
              }
            : {})

        }

      });

    } catch (error) {

      console.error(
        "META ERROR:",
        error
      );

      res.status(500).json({
        error: "Server error"
      });

    }

  }
);

// =====================================================
// STREAM
// =====================================================

app.get(
  "/stream/movie/:id.json",
  async (req, res) => {

    try {

      const id =
        req.params.id.replace(
          "movie-",
          ""
        );

      // =================================================
      // NEW MULTI-QUALITY SYSTEM
      // =================================================

      const {
        data: streams,
        error: streamError
      } = await supabase
        .from("movie_streams")
        .select("*")
        .eq("movie_id", id)
        .order(
          "quality",
          {
            ascending: false
          }
        );

      if (
        !streamError &&
        streams &&
        streams.length > 0
      ) {

        return res.json({

          streams: streams.map(stream => ({

            name:
              stream.quality,

            description:
              `${stream.quality} • Torrent`,

            infoHash:
              stream.info_hash,

            type:
              "torrent",

            behaviorHints: {
              bingeGroup:
                `myfavorites-${stream.quality}`
            }

          }))

        });

      }

      // =================================================
      // OLD SYSTEM FALLBACK
      // Keeps existing movies working
      // =================================================

      const {
        data: movie,
        error: movieError
      } = await supabase
        .from("movies")
        .select("*")
        .eq("id", id)
        .single();

      if (
        movieError ||
        !movie
      ) {

        return res.json({
          streams: []
        });

      }

      if (movie.stream_url) {

        return res.json({

          streams: [
            {
              name:
                movie.quality ||
                "Direct Stream",

              url:
                movie.stream_url
            }
          ]

        });

      }

      if (movie.info_hash) {

        return res.json({

          streams: [
            {
              name:
                movie.quality ||
                "Torrent",

              description:
                movie.quality ||
                "Torrent",

              infoHash:
                movie.info_hash,

              type:
                "torrent"
            }
          ]

        });

      }

      return res.json({
        streams: []
      });

    } catch (error) {

      console.error(
        "STREAM ERROR:",
        error
      );

      res.json({
        streams: []
      });

    }

  }
);

// =====================================================
// HTML ESCAPE
// =====================================================

function escapeHtml(value) {

  return String(value)

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}

// =====================================================
// START
// =====================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Addon running on port ${PORT}`
    );

  }
);
