const express = require("express");
const path = require("path");
// const fs = require('fs'); // Vercel'de dosya sistemi uyumsuz olduğu için kaldırıldı.
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');
const session = require('express-session');
const Product = require("./models/productModel");
const User = require("./models/userModel");
const Post = require("./models/postModel"); // Yeni Post modelini dahil ettik.
const transporter = require('./services/mailServices');
const serverless = require("serverless-http");

const app = express();

let cachedDb = null;

const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

async function connectToDatabase() {
  if (cachedDb) {
    console.log('Varolan veritabanı bağlantısı kullanılıyor.');
    return cachedDb;
  }

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI ortam değişkeni tanımlanmamış.');
  }

  const client = await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  cachedDb = client;
  console.log('Yeni veritabanı bağlantısı oluşturuldu.');
  return cachedDb;
}

app.use(express.static(path.join(__dirname, "public")));

app.use(session({
    secret: SESSION_SECRET, 
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' } 
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set("view engine", "twig");
app.set("views", path.join(__dirname, "views")); 

// NOT: Blog yazıları artık dosyadan değil, veritabanından okunacak.
// Bu fonksiyonlar artık kullanılmadığı için kaldırıldı.
// const readPosts = () => { ... }
// const writePosts = (posts) => { ... }


// Routes
app.use((req, res, next) => {
    res.locals.isLoggedIn = req.session.isLoggedIn || false;
    res.locals.user = req.session.user || null;
    next();
});

const isAdmin = (req, res, next) => {
    if (req.session.isLoggedIn && req.session.user && req.session.user.type === 'admin') {
        next(); 
    } else {
        res.status(403).send("Yetkisiz Erişim"); 
    }
};

app.get('/admin', isAdmin, async (req, res) => {
    await connectToDatabase();
    try {
        const products = await Product.find({});
        const posts = await Post.find({}); // Artık veritabanından çekiliyor.
        res.render('admin', { products: products, posts: posts });
    } catch (error) {
        res.status(500).send('Ürünler yüklenirken bir hata oluştu.');
    }
});

app.get("/", async (req, res) => {
    await connectToDatabase();
    // Products ve Posts verilerini MongoDB'den çekiyoruz.
    const products = await Product.find({});
    const posts = await Post.find({}); 
    res.render("index", { products: products, posts: posts });
});

app.get("/register", (req, res) => res.render("register"));
app.get("/login", (req, res) => res.render("login"));
app.get("/hakkimizda", (req, res) => res.render("about"));
app.get('/urunlerimiz', async (req, res) => {
    await connectToDatabase();
    try {
        const products = await Product.find({});
        res.render('products', { products: products });
    } catch (error) {
        res.status(500).send('Ürünler yüklenirken bir hata oluştu.');
    }
});

app.get("/iletisim", (req, res) => res.render("contact"));
app.get("/sss", (req, res) => res.render("sss"));

app.get("/blog", async (req, res) => {
    await connectToDatabase();
    const posts = await Post.find({}); // Veritabanından çekiliyor.
    res.render("blog", { posts: posts });
});

// Artık bir dosyayı JSON olarak okumaya gerek yok, veritabanından çekiyoruz.
app.get('/posts.json', async (req, res) => {
    await connectToDatabase();
    const posts = await Post.find({});
    res.json({ posts: posts });
});

app.get('/blog/:id', async (req, res) => {
    await connectToDatabase();
    const postId = req.params.id;
    const allPosts = await Post.find({}); // Veritabanından çekiliyor.
    const post = allPosts.find(p => p.id === postId);

    if (post) {
        const otherPosts = allPosts
            .filter(p => p.id !== postId)
            .slice(0, 5)
            .map(p => ({
                id: p.id,
                title: p.title,
                category: p.category
            }));
        res.render('single-post', {
            post: post,
            otherPosts: otherPosts
        });
    } else {
        res.status(404).render('404');
    }
});


app.get('/api/search', async (req, res) => {
    await connectToDatabase();
    const query = req.query.q ? req.query.q.toLowerCase() : '';

    if (query.length < 2) {
        return res.json([]);
    }

    try {
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

        const combinedResults = [
            ...products.map(product => ({
                name: product.title,
                url: `/urunlerimiz`, 
                type: 'Ürün'
            })),
            ...posts.map(post => ({
                name: post.title,
                url: `/blog/${post.id}`,
                type: 'Blog Yazısı'
            }))
        ];

        res.json(combinedResults);
    } catch (error) {
        console.error("Arama sırasında hata oluştu:", error);
        res.status(500).json({ message: "Arama sırasında bir hata oluştu." });
    }
});

app.post('/admin/products', isAdmin, async (req, res) => {
    await connectToDatabase();
    try {
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
        res.status(500).send('Ürün eklenirken bir hata oluştu.');
    }
});


app.post('/admin/products/delete/:id', isAdmin, async (req, res) => {
    await connectToDatabase();
    try {
        const productId = req.params.id;
        await Product.findByIdAndDelete(productId);
        res.redirect('/admin'); 
    } catch (error) {
        res.status(500).send('Ürün silinirken bir hata oluştu.');
    }
});
app.post('/admin/products/update/:id', isAdmin, async (req, res) => {
    await connectToDatabase();
    try {
        const productId = req.params.id;
        const { image, title, description, price, features } = req.body;
        
        const updateData = {
            image,
            title,
            description,
            price
        };

        if (features) {
            updateData.features = features.split(',').map(f => f.trim());
        }

        await Product.findByIdAndUpdate(productId, updateData, { new: true });
        
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send('Ürün güncellenirken bir hata oluştu.');
    }
});
app.post('/api/add-blog-post', isAdmin, async (req, res) => {
    await connectToDatabase();
    const newPost = req.body;
  
    if (!newPost.title || !newPost.content || !newPost.category) {
        return res.status(400).json({ message: "Başlık, kategori ve içerik alanları zorunludur." });
    }
  
    try {
        const postToAdd = new Post({
            id: Date.now().toString(), // Benzersiz ID
            title: newPost.title,
            content: newPost.content,
            category: newPost.category,
            date: new Date().toISOString().split('T')[0] // YYYY-MM-DD
        });
    
        await postToAdd.save();
        res.status(201).json({ message: "Yazı başarıyla eklendi.", post: postToAdd });
    } catch (error) {
        console.error("Yazı ekleme hatası:", error);
        res.status(500).json({ message: "Yazı eklenirken bir hata oluştu." });
    }
});

app.put('/api/posts/:id', isAdmin, async (req, res) => {
    await connectToDatabase();
    const postId = req.params.id;
    const updatedData = req.body;
  
    try {
        const postToUpdate = await Post.findOne({ id: postId });
    
        if (!postToUpdate) {
            return res.status(404).json({ message: "Yazı bulunamadı." });
        }
    
        await Post.updateOne({ id: postId }, updatedData);
        const updatedPost = await Post.findOne({ id: postId });
    
        res.status(200).json({ message: "Yazı başarıyla güncellendi.", post: updatedPost });
    } catch (error) {
        console.error("Yazı güncelleme hatası:", error);
        res.status(500).json({ message: "Yazı güncellenirken bir hata oluştu." });
    }
});

app.delete('/api/posts/:id', isAdmin, async (req, res) => {
    await connectToDatabase();
    const postId = req.params.id;
  
    try {
        const result = await Post.deleteOne({ id: postId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Yazı bulunamadı." });
        }
        res.status(200).json({ message: "Yazı başarıyla silindi." });
    } catch (error) {
        console.error("Yazı silme hatası:", error);
        res.status(500).json({ message: "Yazı silinirken bir hata oluştu." });
    }
});


app.post('/register', async (req, res) => {
    await connectToDatabase();
    const { name, email, password, password_confirmation } = req.body;

    if (!name || !email || !password || !password_confirmation) {
        return res.status(400).json({ message: "Lütfen tüm alanları doldurun." });
    }
    if (password !== password_confirmation) {
        return res.status(400).json({ message: "Girdiğiniz şifreler eşleşmiyor." });
    }
    
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: "Bu e-posta adresi zaten kullanılıyor." });
        }
        const newUser = new User({ name, email, password });
        await newUser.save();
        res.redirect("/login"); 
    } catch (error) {
        console.error("Kayıt sırasında bir hata oluştu:", error);
        res.status(500).json({ message: "Kayıt işlemi sırasında bir sunucu hatası oluştu." });
    }
});

app.post('/login', async (req, res) => {
    await connectToDatabase();
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Lütfen tüm alanları doldurun." });
    }
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "E-posta veya şifre yanlış." });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            req.session.isLoggedIn = true;
            req.session.user = { id: user._id, type: user.type };
   
            if (user.type === 'admin') {
                return res.status(200).json({ redirect: '/admin' }); 
            } else {
                return res.status(200).json({ redirect: '/' });
            }
        } else {
            return res.status(401).json({ message: "E-posta veya şifre yanlış." });
        }
    } catch (error) {
        console.error("Giriş sırasında bir hata oluştu:", error);
        res.status(500).json({ message: "Giriş işlemi sırasında bir sunucu hatası oluştu." });
    }
});

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
            console.error('E-posta gönderme hatası:', error);
            return res.status(500).json({ success: false, message: "E-posta gönderilemedi." });
        }
        console.log('E-posta gönderildi:', info.response);
        res.json({ success: true, message: "Mesajınız başarıyla gönderildi!" });
    });
});

module.exports = serverless(app);
