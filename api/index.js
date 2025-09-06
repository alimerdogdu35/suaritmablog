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
    if (!MONGODB_URI) throw new Error('MONGODB_URI tanımlı değil');
    cachedDb = await mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    console.log('✅ Veritabanına bağlandı.');
    return cachedDb;
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

function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')       // Boşlukları tire ile değiştir
        .replace(/[^\w-]+/g, '')   // Alfanümerik olmayan karakterleri kaldır
        .replace(/--+/g, '-')      // Birden fazla tireyi tek tireye düşür
        .replace(/^-+/, '')        // Başlangıçtaki tireleri kaldır
        .replace(/-+$/, '')        // Sondaki tireleri kaldır
        .replace(/ı/g, 'i')       // Türkçe karakterleri çevir
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');
}

app.get("/register", (req, res) => res.render("register"));
app.get("/login", (req, res) => res.render("login"));
app.get("/hakkimizda", (req, res) => res.render("about"));
app.get("/iletisim", (req, res) => res.render("contact"));
app.get("/sss", (req, res) => res.render("sss"));
app.get("/urunlerimiz", async (req, res) => {
  try {
    // Veritabanı bağlantısını sağla
    await connectToDatabase();
    const products = await Product.find({});
    res.render("products", { products });
  } catch (error) {
    console.error('Ürünleri veritabanından çekerken bir hata oluştu:', error);
    res.status(500).send('Ürünler yüklenirken bir sorun oluştu. Lütfen daha sonra tekrar deneyin.');
  }
});

app.get("/blog", async (req, res) => {
  try {
    // Veritabanı bağlantısını sağla
    await connectToDatabase();
    const posts = await Post.find({});
    res.render("blog", { posts });
  } catch (error) {
    console.error('Blog yazılarını veritabanından çekerken bir hata oluştu:', error);
    res.status(500).send('Blog sayfası yüklenirken bir sorun oluştu. Lütfen daha sonra tekrar deneyin.');
  }
});
app.get("/blog/:slug", async (req, res) => {
    try {
        await connectToDatabase();

     
        const post = await Post.findOne({ slug: req.params.slug });

        if (!post) {
            return res.status(404).render("404", { message: "Blog yazısı bulunamadı." });
        }

        
        const otherPosts = await Post.find({ _id: { $ne: post._id } })
            .sort({ date: -1 }) 
            .limit(5); 

      
        res.render("single-post", { 
            post, 
            otherPosts 
        });

    } catch (error) {
        console.error('Blog yazısı yükleme hatası:', error);
        res.status(500).send('Blog yazısı yüklenirken bir hata oluştu.');
    }
});

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
        if (!name || !email || !password || !password_confirmation)
            return res.status(400).json({ message: "Tüm alanlar gerekli." });
        if (password !== password_confirmation)
            return res.status(400).json({ message: "Şifreler eşleşmiyor." });

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

app.post('/admin/products', verifyJWT, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { image, title, description, price, features } = req.body;
        const newProduct = new Product({
            image,
            title,
            description,
            price,
            features: features.split(',').map(f => f.trim()) // Virgülle ayrılan özellikleri diziye çevir
        });
        await newProduct.save();
        res.redirect('/admin');
    } catch (error) {
        console.error('Ürün ekleme hatası:', error);
        res.status(500).send('Ürün eklenirken bir hata oluştu.');
    }
});

// Ürün silme
app.post('/admin/products/delete/:id', verifyJWT, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { id } = req.params;
        await Product.findByIdAndDelete(id);
        res.redirect('/admin');
    } catch (error) {
        console.error('Ürün silme hatası:', error);
        res.status(500).send('Ürün silinirken bir hata oluştu.');
    }
});

// Ürün güncelleme
app.post('/admin/products/update/:id', verifyJWT, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { id } = req.params;
        const { image, title, description, price, features } = req.body;
        await Product.findByIdAndUpdate(id, {
            image,
            title,
            description,
            price,
            features: features.split(',').map(f => f.trim())
        }, { new: true });
        res.redirect('/admin');
    } catch (error) {
        console.error('Ürün güncelleme hatası:', error);
        res.status(500).send('Ürün güncellenirken bir hata oluştu.');
    }
});
app.post('/api/add-blog-post', verifyJWT, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, category, image, excerpt, content } = req.body;

        // Slug oluştur
        const slug = slugify(title);

        const newPost = new Post({
            title,
            slug, // Slug'ı modele ekle
            category,
            image,
            excerpt,
            content,
            date: new Date(),
            id: await Post.countDocuments() + 5 // ID'yi korumaya devam edebilirsin
        });
        await newPost.save();
        res.status(201).json({ message: "Yazı başarıyla eklendi", post: newPost });
    } catch (error) {
        console.error('Blog yazısı ekleme hatası:', error);
        res.status(500).json({ message: "Yazı eklenirken bir hata oluştu." });
    }
});
// Blog yazısını güncelleme
app.put('/api/posts/:id', verifyJWT, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { id } = req.params;
        const updatedPost = await Post.findOneAndUpdate({ id: id }, req.body, { new: true });
        if (!updatedPost) return res.status(404).json({ message: "Blog yazısı bulunamadı." });
        res.status(200).json({ message: "Yazı başarıyla güncellendi", post: updatedPost });
    } catch (error) {
        console.error('Blog yazısı güncelleme hatası:', error);
        res.status(500).json({ message: "Yazı güncellenirken bir hata oluştu." });
    }
});

// Blog yazısını silme
app.delete('/api/posts/:id', verifyJWT, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { id } = req.params;
        const deletedPost = await Post.findOneAndDelete({ id: id });
        if (!deletedPost) return res.status(404).json({ message: "Blog yazısı bulunamadı." });
        res.status(200).json({ message: "Yazı başarıyla silindi." });
    } catch (error) {
        console.error('Blog yazısı silme hatası:', error);
        res.status(500).json({ message: "Yazı silinirken bir hata oluştu." });
    }
});

// ---------------- IMPORT POSTS (MANUEL) ----------------


// ---------------- NODE.JS SERVER ----------------
if (process.env.NODE_ENV !== "production") {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, async () => {
        console.log(`✅ Server çalışıyor: http://localhost:${PORT}`);

        // Lokal geliştirme için tek seferlik import
        try {
            await connectToDatabase();
            await importData();
            console.log("✅ Postlar import edildi (lokal)");
        } catch (err) {
            console.error("Import hatası (lokal):", err);
        }
    });
}

// ---------------- EXPORT SERVERLESS HANDLER ----------------
module.exports = app;
module.exports.handler = serverless(app);
