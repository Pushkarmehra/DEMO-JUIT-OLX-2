// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({limit: '10mb'}));

// Connect to MongoDB
mongoose.connect('mongodb+srv://241033037:LftHfe7NhSpWRlY5@juit-olx.qu7gpby.mongodb.net/juit-olx');

// Product Schema
const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  seller: String,
  whatsapp: String,
  condition: String,
  description: String,
  imagePath: String,
  dateAdded: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

// API Routes
app.get('/api/products', async (req, res) => {
  const products = await Product.find().sort({ dateAdded: -1 });
  res.json(products);
});

app.post('/api/products', async (req, res) => {
  const product = new Product(req.body);
  await product.save();
  res.json(product);
});

app.listen(3000, () => console.log('Server running on port 3000'));