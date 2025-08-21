const express = require("express");
const app = express();

app.set("view engine", "twig");
app.use(express.static(__dirname + '/public'));

app.get("/", (req, res) => {
  res.render("index");
});



module.exports = app;