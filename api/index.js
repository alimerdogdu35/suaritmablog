const express = require("express");
const app = express();

app.set("view engine", "twig");
app.use(express.static(__dirname + '/public'));



app.get("/", (req, res) => {
  res.render("index");
});

app.get("/about", (req, res) => {
  res.render("about");
});

/*app.listen(3000, () => {
  console.log("Sunucu 3000 portunda çalışıyor");
});
*/
module.exports = app;