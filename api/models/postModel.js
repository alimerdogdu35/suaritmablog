const mongoose = require('mongoose');

// Blog yazısı şeması
const postSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    category: { type: String, required: true },
    date: { type: String, required: true }
});

// Modeli dışa aktar
module.exports = mongoose.model('Post', postSchema);
