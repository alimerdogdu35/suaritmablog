// api/importPostsFunction.js
const { importData } = require("./importPosts");
const serverless = require("serverless-http");
const mongoose = require("mongoose");
const express = require("express");

const app = express();
app.use(express.json());

app.post("/", async (req, res) => {
    try {
        // Fonksiyon her çağrıldığında yeni bir veritabanı bağlantısı kurar
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            // Serverless fonksiyonda bağlantı havuzu kullanmak performansı artırabilir
            // bufferCommands: false,
            // serverSelectionTimeoutMS: 5000,
        });

        const result = await importData();
        res.status(result.status).json({ message: result.message });
    } catch (err) {
        console.error("Fonksiyon hatası:", err);
        res.status(500).json({ message: "Veri yüklenirken hata oluştu: " + err.message });
    } finally {
        // İşlem bittikten sonra bağlantıyı kapatırız
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
    }
});

module.exports = app;
module.exports.handler = serverless(app);