const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Product = require("./models/productModel");
const User = require("./models/userModel");
const Post = require("./models/postModel");
const transporter = require('./services/mailServices');
const serverless = require("serverless-http");
const cookieParser = require('cookie-parser');
const { importData } = require("importPosts");

const app = express();
let cachedDb = null;

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

app.use(cookieParser());
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "twig");
app.set("views", path.join(process.cwd(), "api", "views"));

// ---------------- DATABASE ----------------
async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    if (!MONGODB_URI) throw new Error('MONGODB_URI ortam değişkeni tanımlanmamış.');
    try {
        const client = await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        cachedDb = client;
        console.log('✅ Veritabanına bağlandı.');
        return cachedDb;
    } catch (error) {
        console.error('❌ Veritabanı bağlantı hatası:', error);
        throw error;
    }
}

// ---------------- JWT & ADMIN MIDDLEWARE ----------------
const verifyJWT = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
    if (!token) return res.status(403).send('Yetkisiz erişim (Token yok)');

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).send('Yetkisiz erişim (Token geçersiz)');
        req.user = decoded;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user?.type === 'admin') next();
    else res.status(403).send("Yetkisiz erişim (Admin değil)");
};

// ---------------- ROUTES ----------------
app.get("/", async (req, res) => {
    try {
        await connectToDatabase();
        const products = await Product.find({});
        const posts = await Post.find({});
        res.render("index", { products, posts });
    } catch (error) {
        console.error('Ana sayfa hatası:', error);
        res.status(500).send('Ana sayfa yüklenirken hata oluştu.');
    }
});

app.get("/register", (req, res) => res.render("register"));
app.get("/login", (req, res) => res.render("login"));
app.get("/hakkimizda", (req, res) => res.render("about"));
app.get("/iletisim", (req, res) => res.render("contact"));
app.get("/sss", (req, res) => res.render("sss"));

// ---------------- ADMIN ----------------
app.get('/admin', verifyJWT, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const products = await Product.find({});
        const posts = await Post.find({});
        res.render('admin', { products, posts });
    } catch (error) {
        console.error('Admin sayfası hatası:', error);
        res.status(500).send('Admin sayfası yüklenirken hata oluştu.');
    }
});

// ---------------- AUTH ----------------
app.post('/register', async (req, res) => {
    try {
        await connectToDatabase();
        const { name, email, password, password_confirmation } = req.body;
        if (!name || !email || !password || !password_confirmation) return res.status(400).json({ message: "Tüm alanlar gerekli." });
        if (password !== password_confirmation) return res.status(400).json({ message: "Şifreler eşleşmiyor." });

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(409).json({ message: "E-posta kullanılıyor." });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword, type: 'user' });
        await newUser.save();

        res.redirect("/login");
    } catch (error) {
        console.error("Kayıt hatası:", error);
        res.status(500).json({ message: "Kayıt sırasında hata oluştu." });
    }
});

app.post('/login', async (req, res) => {
    try {
        await connectToDatabase();
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: "Tüm alanlar gerekli." });

        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ message: "E-posta veya şifre yanlış." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "E-posta veya şifre yanlış." });

        const token = jwt.sign({ id: user._id, type: user.type }, JWT_SECRET, { expiresIn: '1d' });
        res.cookie('token', token, { httpOnly: true });
        res.status(200).json({ token, redirect: user.type === 'admin' ? '/admin' : '/' });
    } catch (error) {
        console.error("Login hatası:", error);
        res.status(500).json({ message: "Giriş sırasında hata oluştu." });
    }
});

// ---------------- SERVER START & IMPORT ----------------
async function startServer() {
    try {
        await connectToDatabase();
        await importData(); // Tek seferlik post importu

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`✅ Server çalışıyor: http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Server başlatılamadı:', err);
    }
}

startServer();

// ---------------- EXPORT ----------------
module.exports = app;
module.exports.handler = serverless(app);
