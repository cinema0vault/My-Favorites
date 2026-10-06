const express = require("express");

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

const movies = {
  "big-buck-bunny": {
    name: "Big Buck Bunny",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
  }
};

app.get("/", (req, res) => {
  res.send("My Favorites Stremio Addon is running!");
});

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

app.get("/catalog/movie/my-favorites.json", (req, res) => {
  res.json({
    metas: Object.entries(movies).map(([id, movie]) => ({
      id,
      type: "movie",
      name: movie.name
    }))
  });
});

app.get("/meta/movie/:id.json", (req, res) => {
  const movie = movies[req.params.id];

  if (!movie) {
    return res.status(404).json({
      error: "Movie not found"
    });
  }

  res.json({
    meta: {
      id: req.params.id,
      type: "movie",
      name: movie.name
    }
  });
});

app.get("/stream/movie/:id.json", (req, res) => {
  const movie = movies[req.params.id];

  if (!movie) {
    return res.status(404).json({
      streams: []
    });
  }

  res.json({
    streams: [
      {
        name: "My Server",
        title: "Direct Stream",
        url: movie.url
      }
    ]
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Addon running on port ${PORT}`);
});
