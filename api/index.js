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

const app = express();

let cachedDb = null;

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

// -------------------- DATABASE CONNECTION --------------------
async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    if (!MONGODB_URI) throw new Error('MONGODB_URI ortam değişkeni tanımlanmamış.');
    try {
        const client = await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        cachedDb = client;
        console.log('Veritabanına bağlandı.');
        return cachedDb;
    } catch (error) {
        console.error('Veritabanı bağlantı hatası:', error);
        throw error;
    }
}

// -------------------- MIDDLEWARE --------------------
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "twig");
app.set("views", path.join(process.cwd(), "api", "views"));

// JWT doğrulama middleware
const verifyJWT = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
    if (!token) return res.status(403).send('Yetkisiz erişim');

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).send('Yetkisiz erişim');
        req.user = decoded;
        next();
    });
};

// Admin kontrolü
const isAdmin = (req, res, next) => {
    if (req.user && req.user.type === 'admin') next();
    else res.status(403).send("Yetkisiz erişim");
};

// -------------------- ROUTES --------------------

// Ana sayfa
app.get("/", async (req, res) => {
    try {
        await connectToDatabase();
        const products = await Product.find({});
        const posts = await Post.find({}); 
        res.render("index", { products, posts });
    } catch (error) {
        console.error('Ana sayfa yüklenirken hata:', error);
        res.status(500).send('Ana sayfa yüklenirken hata oluştu.');
    }
});

// Sayfalar
app.get("/register", (req, res) => res.render("register"));
app.get("/login", (req, res) => res.render("login"));
app.get("/hakkimizda", (req, res) => res.render("about"));
app.get("/iletisim", (req, res) => res.render("contact"));
app.get("/sss", (req, res) => res.render("sss"));

// Ürünler
app.get('/urunlerimiz', async (req, res) => {
    try {
        await connectToDatabase();
        const products = await Product.find({});
        res.render('products', { products });
    } catch (error) {
        console.error('Ürünler sayfası hatası:', error);
        res.status(500).send('Ürünler yüklenirken hata oluştu.');
    }
});

// Blog
app.get("/blog", async (req, res) => {
    try {
        await connectToDatabase();
        const posts = await Post.find({});
        res.render("blog", { posts });
    } catch (error) {
        console.error('Blog sayfası hatası:', error);
        res.status(500).send('Blog sayfası yüklenirken hata oluştu.');
    }
});

app.get('/blog/:id', async (req, res) => {
    try {
        await connectToDatabase();
        const postId = req.params.id;
        const allPosts = await Post.find({});
        const post = allPosts.find(p => p.id === postId);

        if (!post) return res.status(404).render('404');

        const otherPosts = allPosts.filter(p => p.id !== postId).slice(0, 5).map(p => ({
            id: p.id,
            title: p.title,
            category: p.category
        }));

        res.render('single-post', { post, otherPosts });
    } catch (error) {
        console.error('Tekil blog yazısı hatası:', error);
        res.status(500).send('Blog yazısı yüklenirken hata oluştu.');
    }
});

// Arama
app.get('/api/search', async (req, res) => {
    try {
        await connectToDatabase();
        const query = req.query.q?.toLowerCase() || '';
        if (query.length < 2) return res.json([]);

        const products = await Product.find({
            $or: [
                { title: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } }
            ]
        }).limit(5).select('title');

        const posts = await Post.find({
            $or: [
                { title: { $regex: query, $options: 'i' } },
                { content: { $regex: query, $options: 'i' } }
            ]
        }).limit(5);

        const results = [
            ...products.map(p => ({ name: p.title, url: '/urunlerimiz', type: 'Ürün' })),
            ...posts.map(p => ({ name: p.title, url: `/blog/${p.id}`, type: 'Blog Yazısı' }))
        ];

        res.json(results);
    } catch (error) {
        console.error("Arama hatası:", error);
        res.status(500).json({ message: "Arama sırasında hata oluştu." });
    }
});

// -------------------- ADMIN --------------------
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

// Ürün işlemleri
app.post('/admin/products', verifyJWT, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { image, title, description, price, features } = req.body;
        const newProduct = new Product({
            image,
            title,
            description,
            price,
            features: features.split(',').map(f => f.trim())
        });
        await newProduct.save();
        res.redirect('/admin');
    } catch (error) {
        console.error("Ürün ekleme hatası:", error);
        res.status(500).send('Ürün eklenirken hata oluştu.');
    }
});

app.post('/admin/products/delete/:id', verifyJWT, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        await Product.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (error) {
        console.error("Ürün silme hatası:", error);
        res.status(500).send('Ürün silinirken hata oluştu.');
    }
});

// Blog işlemleri
app.post('/api/add-blog-post', verifyJWT, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, content, category } = req.body;
        if (!title || !content || !category) return res.status(400).json({ message: "Başlık, kategori ve içerik zorunludur." });

        const post = new Post({
            id: Date.now().toString(),
            title,
            content,
            category,
            date: new Date().toISOString().split('T')[0]
        });
        await post.save();
        res.status(201).json({ message: "Yazı eklendi.", post });
    } catch (error) {
        console.error("Blog ekleme hatası:", error);
        res.status(500).json({ message: "Blog eklenirken hata oluştu." });
    }
});

// -------------------- AUTH --------------------
app.post('/register', async (req, res) => {
    try {
        await connectToDatabase();
        const { name, email, password, password_confirmation } = req.body;
        if (!name || !email || !password || !password_confirmation) return res.status(400).json({ message: "Tüm alanlar gerekli." });
        if (password !== password_confirmation) return res.status(400).json({ message: "Şifreler eşleşmiyor." });

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(409).json({ message: "E-posta kullanılıyor." });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword });
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
        res.status(200).json({ token, redirect: user.type === 'admin' ? '/admin' : '/' });
    } catch (error) {
        console.error("Login hatası:", error);
        res.status(500).json({ message: "Giriş sırasında hata oluştu." });
    }
});

// -------------------- CONTACT --------------------
app.post("/send", (req, res) => {
    const { name, email, phone, comments } = req.body;
    const mailOptions = {
        from: 'alimcan145@gmail.com',
        to: 'alimcan.145@hotmail.com',
        subject: 'İletişim Formu Mesajı',
        html: `
            <p><strong>Ad:</strong> ${name}</p>
            <p><strong>E-posta:</strong> ${email}</p>
            <p><strong>Telefon:</strong> ${phone}</p>
            <p><strong>Mesaj:</strong> ${comments}</p>
        `
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Mail hatası:', error);
            return res.status(500).json({ success: false, message: "Mail gönderilemedi." });
        }
        console.log('Mail gönderildi:', info.response);
        res.json({ success: true, message: "Mesaj gönderildi!" });
    });
});

// -------------------- EXPORT --------------------
module.exports = app;
module.exports.handler = serverless(app);
