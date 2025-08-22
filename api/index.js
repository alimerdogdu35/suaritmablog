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

app.get("/products", (req, res) => {
  res.render("products"); // views/products.twig
});

app.get("/contact", (req, res) => {
  res.render("contact"); // views/contact.twig
});
app.get("/sss", (req, res) => {
  res.render("sss"); // views/sss.twig
});
app.get("/blog", (req, res) => {
  res.render("blog"); // views/blog.twig
});

// app.listen() yok, onun yerine:
app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
module.exports = app;
module.exports.handler = serverless(app);
