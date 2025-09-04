const express = require("express");
const path = require("path");
const fs = require('fs');
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');
const session = require('express-session');
const Product = require("./models/productModel");
const User = require("./models/userModel");
const transporter = require('./services/mailServices');
const serverless = require("serverless-http");

const app = express();

// Veritabanı bağlantısını önbelleğe almak için global bir değişken tanımlayın.
// Bu, Vercel'de her istekte yeni bir bağlantı açılmasını engeller.
let cachedDb = null;

// Veritabanı URL'sini Vercel'de Ortam Değişkeni olarak ayarlayın.
const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

// MongoDB'ye bağlanmak ve bağlantıyı önbelleğe almak için bir fonksiyon.
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

// Blog yazılarını dosyadan okur.
// NOT: Vercel gibi sunucusuz ortamlarda dosya sistemi kalıcı değildir!
// Bu fonksiyonlar sadece kısa süreli testler için uygundur, canlı bir site için önerilmez.
const postsFilePath = path.join(__dirname, 'posts.json');

const readPosts = () => {
  try {
    const data = fs.readFileSync(postsFilePath, 'utf8');
    return JSON.parse(data).posts;
  } catch (error) {
    console.error("posts.json okuma hatası:", error);
    return [];
  }
};

// Tüm blog yazılarını dosyaya yazar.
const writePosts = (posts) => {
  fs.writeFileSync(postsFilePath, JSON.stringify({ posts }, null, 2), 'utf8');
};


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
        const posts = readPosts();
        res.render('admin', { products: products, posts: posts });
    } catch (error) {
        res.status(500).send('Ürünler yüklenirken bir hata oluştu.');
    }
});

app.get("/", async (req, res) => {
    await connectToDatabase();
    const products = await Product.find({});
    const posts = readPosts();
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

app.get("/blog", (req, res) => {
    res.render("blog", { posts: readPosts() });
});

app.get('/posts.json', (req, res) => {
  res.json({ posts: readPosts() });
});

app.get('/blog/:id', (req, res) => {
    const postId = req.params.id;
    const allPosts = readPosts();
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
       
        const allPosts = readPosts();
        const posts = allPosts.filter(post =>
            post.title.toLowerCase().includes(query) ||
            post.content.toLowerCase().includes(query)
        ).slice(0, 5); 

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
app.post('/api/add-blog-post', isAdmin, (req, res) => {
    const newPost = req.body;
  
    if (!newPost.title || !newPost.content || !newPost.category) {
        return res.status(400).json({ message: "Başlık, kategori ve içerik alanları zorunludur." });
    }
  
    const posts = readPosts();
    newPost.id = Date.now().toString(); // Benzersiz ID
    newPost.date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
    posts.push(newPost);
    writePosts(posts);
  
    res.status(201).json({ message: "Yazı başarıyla eklendi.", post: newPost });
});

app.put('/api/posts/:id', isAdmin, (req, res) => {
    const postId = req.params.id;
    const updatedData = req.body;
    let posts = readPosts();
  
    const postIndex = posts.findIndex(post => post.id === postId);
  
    if (postIndex === -1) {
        return res.status(404).json({ message: "Yazı bulunamadı." });
    }
  
    posts[postIndex] = { ...posts[postIndex], ...updatedData };
    writePosts(posts);
  
    res.status(200).json({ message: "Yazı başarıyla güncellendi.", post: posts[postIndex] });
});

app.delete('/api/posts/:id', isAdmin, (req, res) => {
    const postId = req.params.id;
    let posts = readPosts();
  
    const initialLength = posts.length;
    posts = posts.filter(post => post.id !== postId);
  
    if (posts.length === initialLength) {
        return res.status(404).json({ message: "Yazı bulunamadı." });
    }
  
    writePosts(posts);
  
    res.status(200).json({ message: "Yazı başarıyla silindi." });
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
