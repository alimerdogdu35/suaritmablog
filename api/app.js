const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Merhaba Vercel! 🚀 Blog sitesi yayında!");
});

module.exports = app;