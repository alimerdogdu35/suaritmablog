// importPosts.js
const fs = require("fs");
const path = require("path");
const Post = require("./models/postModel");
const mongoose = require("mongoose");

async function importData() {
    try {
        if (mongoose.connection.readyState !== 1) {
            return { status: 500, message: "Veritabanı bağlantısı bulunamıyor." };
        }

        const filePath = path.join(__dirname, 'post.json');
        const raw = fs.readFileSync(filePath, "utf-8");
        const json = JSON.parse(raw);

        if (!json.posts || !Array.isArray(json.posts)) {
            throw new Error("post.json formatı yanlış");
        }

        await Post.deleteMany({});
        await Post.insertMany(json.posts);

        console.log("✅ Post.json verileri MongoDB'ye aktarıldı!");
        return { status: 200, message: "Veriler başarıyla yüklendi." };
    } catch (err) {
        console.error("Hata:", err);
        return { status: 500, message: "Veri yüklenirken hata oluştu: " + err.message };
    }
}

module.exports = { importData };