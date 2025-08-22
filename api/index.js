const express = require("express");
const path = require("path");
const serverless = require("serverless-http");

const app = express();

// View Engine olarak Twig kullan
app.set("view engine", "twig");
app.set("views", path.join(__dirname, "../views")); // views klasörünü ayarla

// Public klasörünü statik olarak ayarla
app.use(express.static(path.join(__dirname, "../public")));

// Routes
app.get("/", (req, res) => {
  res.render("index"); // views/index.twig
});

app.get("/about", (req, res) => {
  res.render("about"); // views/about.twig
});

// app.listen() yok, onun yerine:
module.exports = app;
module.exports.handler = serverless(app);
