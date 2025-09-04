// importPosts.js
const mongoose = require("mongoose");
const fs = require("fs");
const Post = require("./models/postModel");

async function importData() {
    try {
        if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI tanımlı değil");

        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        const raw = fs.readFileSync("post.json", "utf-8");
        const json = JSON.parse(raw);

        if (!json.posts || !Array.isArray(json.posts)) throw new Error("post.json formatı yanlış");

        await Post.deleteMany({});
        await Post.insertMany(json.posts);

        console.log("✅ Post.json verileri MongoDB'ye aktarıldı!");
    } catch (err) {
        console.error("Hata:", err);
    } finally {
        await mongoose.connection.close();
    }
}

module.exports = { importData };
