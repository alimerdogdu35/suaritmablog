const express = require("express");
const path = require("path");
const fs = require('fs');
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');
const session = require('express-session');
const Product = require("../models/productModel");
const User = require("../models/userModel");
const transporter = require('../services/mailServices');
const serverless = require("serverless-http");

const app = express();

app.use(session({
    secret: '1823uedj109238xms!.', 
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.set("view engine", "twig");
app.set("views", path.join(__dirname, "../views")); 

let posts = [];
fs.readFile(path.join(__dirname, 'posts.json'), 'utf8', (err, data) => {
    if (err) {
        console.error('posts.json okunamadı:', err);
        return;
    }
    posts = JSON.parse(data).posts;
    console.log('Blog yazıları yüklendi.');
});

// Routes
app.use((req, res, next) => {
    // res.locals'a eklenen tüm değişkenler, tüm şablonlara otomatik olarak gönderilir.
       
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
    try {
        const products = await Product.find({}); // Tüm ürünleri bul
        res.render('admin', { products: products }); // Twig'e gönder
    } catch (error) {
        res.status(500).send('Ürünler yüklenirken bir hata oluştu.');
    }
});

app.get("/", (req, res) => {
  res.render("index", { posts: posts });
});

app.get("/register", (req, res) => {
  res.render("register");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/about", (req, res) => {
  res.render("about");
});

app.get('/products', async (req, res) => {
    try {
        const products = await Product.find({});
        res.render('products', { products: products });
    } catch (error) {
        res.status(500).send('Ürünler yüklenirken bir hata oluştu.');
    }
});

app.get("/contact", (req, res) => {
  res.render("contact");
});

app.get("/sss", (req, res) => {
  res.render("sss");
});

app.get("/blog", (req, res) => {
  res.render("blog",{ posts: posts});
});

app.get('/posts.json', (req, res) => {
  res.json({ posts: posts });
});

app.get('/blog/:id', (req, res) => {
    const postId = req.params.id;
    const post = posts.find(p => p.id === postId);

    if (post) {
        const otherPosts = posts
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
app.post('/admin/products', isAdmin, async (req, res) => {
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
    try {
        const productId = req.params.id;
        await Product.findByIdAndDelete(productId);
        res.redirect('/admin'); 
    } catch (error) {
        res.status(500).send('Ürün silinirken bir hata oluştu.');
    }
});

app.post('/register', async (req, res) => {
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
            // Şifre eşleştiğinde oturumu ayarla
            req.session.isLoggedIn = true;
            req.session.user = { id: user._id, type: user.type };
   
            if (user.type === 'admin') {
                return res.redirect('/admin'); 
            } else { // user.type === 'user' ise
                return res.redirect('/'); 
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

mongoose.connect("mongodb://127.0.0.1:27017/suaritma")
    .then(() => {
        console.log("MongoDB bağlantısı başarılı.");
        app.listen(3000, () => {
            console.log("Server is running on http://localhost:3000");
        });
    })
    .catch(err => {
        console.error("MongoDB bağlantısı hatası:", err);
    });

module.exports = app;
module.exports.handler = serverless(app);