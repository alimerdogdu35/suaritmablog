const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // "karsilastirma-2025"
  title: String,
  slug: { type: String, unique: true, required: true },
  category: String,
  date: Date,
  image: String,
  excerpt: String,
  content: String
});

module.exports = mongoose.models.Post || mongoose.model("Post", postSchema);
