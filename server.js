const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 10000;

// CORS for Stremio
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Home
app.get("/", (req, res) => {
  res.send("My Favorites Stremio Addon is running!");
});

// Manifest
app.get("/manifest.json", (req, res) => {
  res.json({
    id: "com.cinemavault.myfavorites",
    version: "1.0.0",
    name: "My Favorites",
    description: "Personal Stremio addon",
    resources: ["catalog", "meta", "stream"],
    types: ["movie"],
    catalogs: [
      {
        type: "movie",
        id: "my-favorites",
        name: "My Favorites"
      }
    ]
  });
});

// Catalog
app.get("/catalog/movie/my-favorites.json", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("movies")
      .select("id,title,poster_url");

    if (error) {
      console.error(error);
      return res.status(500).json({ metas: [] });
    }

    const metas = data.map(movie => ({
      id: `movie-${movie.id}`,
      type: "movie",
      name: movie.title,
      ...(movie.poster_url
        ? { poster: movie.poster_url }
        : {})
    }));

    res.json({ metas });

  } catch (error) {
    console.error(error);
    res.status(500).json({ metas: [] });
  }
});

// Metadata
app.get("/meta/movie/:id.json", async (req, res) => {
  try {
    const id = req.params.id.replace("movie-", "");

    const { data, error } = await supabase
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
        id: `movie-${data.id}`,
        type: "movie",
        name: data.title,
        ...(data.poster_url
          ? { poster: data.poster_url }
          : {})
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Server error"
    });
  }
});

// Stream
app.get("/stream/movie/:id.json", async (req, res) => {
  try {
    const id = req.params.id.replace("movie-", "");

    const { data, error } = await supabase
      .from("movies")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.json({ streams: [] });
    }

    res.json({
      streams: [
        {
          name: "My Server",
          title: data.quality || "Direct Stream",
          url: data.stream_url
        }
      ]
    });

  } catch (error) {
    console.error(error);
    res.json({ streams: [] });
  }
});

// Start
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Addon running on port ${PORT}`);
});
