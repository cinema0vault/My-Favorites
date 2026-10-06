const express = require("express");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
const parseTorrent = require("parse-torrent-file");

const app = express();
const PORT = process.env.PORT || 10000;

// =====================================================
// Upload configuration
// =====================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

// =====================================================
// CORS - required by Stremio
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
// Supabase
// =====================================================

if (!process.env.SUPABASE_URL) {
  console.error("ERROR: SUPABASE_URL is missing");
}

if (!process.env.SUPABASE_KEY) {
  console.error("ERROR: SUPABASE_KEY is missing");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// =====================================================
// Home
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
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>My Favorites Manager</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, sans-serif;
      max-width: 700px;
      margin: 40px auto;
      padding: 20px;
      background: #f5f5f5;
    }

    .box {
      background: white;
      border: 1px solid #ddd;
      padding: 25px;
      border-radius: 12px;
    }

    h1 {
      margin-top: 0;
    }

    label {
      display: block;
      margin-top: 15px;
      font-weight: bold;
    }

    input,
    select,
    button {
      width: 100%;
      padding: 12px;
      margin-top: 7px;
      font-size: 15px;
    }

    button {
      margin-top: 20px;
      cursor: pointer;
      font-weight: bold;
    }

    .hint {
      color: #666;
      font-size: 13px;
    }
  </style>
</head>

<body>

<div class="box">

<h1>My Favorites Manager</h1>

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

  <label>Magnet link</label>

  <input
    type="text"
    name="magnet"
    placeholder="magnet:?xt=urn:btih:..."
  >

  <p class="hint">
    Enter a magnet link OR upload a .torrent file.
  </p>

  <label>.torrent file</label>

  <input
    type="file"
    name="torrent"
    accept=".torrent"
  >

  <label>Quality</label>

  <select name="quality">

    <option value="2160p">
      2160p
    </option>

    <option value="1080p" selected>
      1080p
    </option>

    <option value="720p">
      720p
    </option>

    <option value="480p">
      480p
    </option>

  </select>

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
// ADD MOVIE
// =====================================================

app.post("/admin/add", upload.single("torrent"), async (req, res) => {
  try {
    const { title, magnet, quality } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).send("Movie title is required");
    }

    if (!magnet && !req.file) {
      return res.status(400).send(
        "Provide a magnet link or .torrent file"
      );
    }

    let torrentType = null;
    let torrentData = null;
    let infoHash = null;

    // =================================================
    // Magnet link
    // =================================================

    if (magnet && magnet.trim()) {
      torrentType = "magnet";
      torrentData = magnet.trim();

      try {
        const parsed = parseTorrent(torrentData);

        infoHash = parsed.infoHash || null;

      } catch (err) {
        console.error("Magnet parsing error:", err);

        return res.status(400).send(
          "Invalid magnet link"
        );
      }
    }

    // =================================================
    // .torrent file
    // =================================================

    if (req.file) {
      torrentType = "torrent";

      if (
        !req.file.originalname
          .toLowerCase()
          .endsWith(".torrent")
      ) {
        return res.status(400).send(
          "Please upload a .torrent file."
        );
      }

      try {
        const parsed = parseTorrent(req.file.buffer);

        infoHash = parsed.infoHash || null;

        if (!infoHash) {
          return res.status(400).send(
            "Could not extract torrent info hash"
          );
        }

        torrentData =
          req.file.buffer.toString("base64");

      } catch (err) {
        console.error(
          "Torrent parsing error:",
          err
        );

        return res.status(400).send(
          "Invalid .torrent file"
        );
      }
    }

    // =================================================
    // Insert into Supabase
    // =================================================

    const { data, error } = await supabase
      .from("movies")
      .insert([
        {
          title: title.trim(),
          quality: quality || "1080p",
          torrent_type: torrentType,
          torrent_data: torrentData,
          info_hash: infoHash,
          stream_url: null
        }
      ])
      .select()
      .single();

    if (error) {
      console.error(
        "SUPABASE INSERT ERROR:",
        error
      );

      return res.status(500).send(
        "Database error: " + error.message
      );
    }

    // =================================================
    // Success
    // =================================================

    res.send(`
<!DOCTYPE html>
<html>

<head>
  <meta name="viewport"
        content="width=device-width, initial-scale=1">

  <title>Movie Added</title>
</head>

<body style="
  font-family: Arial;
  max-width: 600px;
  margin: 40px auto;
  padding: 20px;
">

<h2>Movie added successfully</h2>

<p>
  <strong>Movie:</strong>
  ${escapeHtml(data.title)}
</p>

<p>
  <strong>Source:</strong>
  ${escapeHtml(data.torrent_type)}
</p>

<p>
  <strong>Quality:</strong>
  ${escapeHtml(data.quality)}
</p>

<p>
  <strong>Info Hash:</strong>
  ${escapeHtml(data.info_hash || "Not found")}
</p>

<p>
  <strong>Database ID:</strong>
  ${data.id}
</p>

<br>

<a href="/admin">
  Add another movie
</a>

</body>
</html>
    `);

  } catch (error) {
    console.error(
      "ADMIN ERROR:",
      error
    );

    res.status(500).send(
      "Server error: " + error.message
    );
  }
});

// =====================================================
// MANIFEST
// =====================================================

app.get("/manifest.json", (req, res) => {

  res.json({

    id: "com.cinemavault.myfavorites",

    version: "1.0.0",

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
    ]

  });

});

// =====================================================
// CATALOG
// =====================================================

app.get(
  "/catalog/movie/my-favorites.json",
  async (req, res) => {

    try {

      const { data, error } = await supabase
        .from("movies")
        .select(
          "id,title,poster_url,quality"
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

        return res.status(500).json({
          metas: []
        });

      }

      const metas = data.map(movie => ({

        id: `movie-${movie.id}`,

        type: "movie",

        name: movie.title,

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
        "CATALOG SERVER ERROR:",
        error
      );

      res.status(500).json({
        metas: []
      });

    }

  }
);

// =====================================================
// METADATA
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

      const { data, error } =
        await supabase
          .from("movies")
          .select("*")
          .eq("id", id)
          .single();

      if (error || !data) {

        return res.json({
          streams: []
        });

      }

      // Direct HTTP stream
      if (data.stream_url) {

        return res.json({

          streams: [

            {
              name:
                "My Server",

              title:
                data.quality ||
                "Direct Stream",

              url:
                data.stream_url
            }

          ]

        });

      }

      // Torrent information exists,
      // but there is no torrent-to-HTTP
      // streaming backend yet.
      if (
        data.torrent_type &&
        (data.torrent_data || data.info_hash)
      ) {

        return res.json({

          streams: []

        });

      }

      return res.json({
        streams: []
      });

    }

    catch (error) {

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
// HTML escaping
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
// START SERVER
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
