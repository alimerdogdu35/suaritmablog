const fs = require("fs");
const mongoose = require("mongoose");
const Post = require("./models/postModel"); // api/models klasörü içinde
const serverless = require("serverless-http");

async function importData() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI tanımlı değil");
        }

        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        const raw = fs.readFileSync("post.json", "utf-8"); // JSON dosyan burada olmalı
        const json = JSON.parse(raw);

        if (!json.posts || !Array.isArray(json.posts)) {
            throw new Error("post.json formatı yanlış, 'posts' array'i bulunamadı");
        }

        // Mevcut postları sil ve yeni postları ekle
        await Post.deleteMany({});
        await Post.insertMany(json.posts);

        console.log("✅ Post.json verileri MongoDB'ye aktarıldı!");
        return { status: 200, message: "Postlar başarıyla eklendi" };
    } catch (err) {
        console.error("Hata:", err);
        return { status: 500, message: err.message };
    } finally {
        await mongoose.connection.close();
    }
}

const handler = async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Sadece POST isteği desteklenir" });
    }

    const result = await importData();
    res.status(result.status).json({ message: result.message });
};

module.exports = serverless(handler);
