// ============================================
// BACKEND SERVER (server.js)
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cloudinary configuration (for image uploads)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'your_cloud_name',
  api_key: process.env.CLOUDINARY_API_KEY || 'your_api_key',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'your_api_secret'
});

// Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'juit-olx-products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    public_id: (req, file) => 'product_' + Date.now()
  }
});

const upload = multer({ storage: storage });

// MongoDB Connection
const mongoURI = 'mongodb+srv://241033037:LftHfe7NhSpWRlY5@juit-olx.qu7gpby.mongodb.net/juit-olx?retryWrites=true&w=majority';

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB successfully!');
  console.log('Database:', mongoose.connection.name);
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
});

// Product Schema
const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 1
  },
  seller: {
    type: String,
    required: true,
    trim: true
  },
  whatsapp: {
    type: String,
    required: true,
    match: /^91\d{10}$/
  },
  condition: {
    type: String,
    required: true,
    enum: ['Brand New', 'Like New', 'Excellent', 'Good', 'Fair']
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  imagePath: {
    type: String,
    required: true
  },
  imagePublicId: {
    type: String,
    required: false
  },
  dateAdded: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

// Add indexes for better search performance
productSchema.index({ name: 'text', description: 'text', seller: 'text' });
productSchema.index({ dateAdded: -1 });
productSchema.index({ price: 1 });

const Product = mongoose.model('Product', productSchema);

// ============================================
// API ROUTES
// ============================================

// GET all products
app.get('/api/products', async (req, res) => {
  try {
    const { search, minPrice, maxPrice, condition, sort } = req.query;
    
    let query = { isActive: true };
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { seller: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Price range filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseInt(minPrice);
      if (maxPrice) query.price.$lte = parseInt(maxPrice);
    }
    
    // Condition filter
    if (condition) {
      query.condition = condition;
    }
    
    // Sorting
    let sortOption = { dateAdded: -1 }; // Default: newest first
    if (sort === 'price_low') sortOption = { price: 1 };
    if (sort === 'price_high') sortOption = { price: -1 };
    if (sort === 'name') sortOption = { name: 1 };
    
    const products = await Product.find(query).sort(sortOption);
    
    console.log(`📦 Fetched ${products.length} products from MongoDB`);
    res.json(products);
  } catch (error) {
    console.error('❌ Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    console.error('❌ Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST new product with image upload
app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, price, seller, whatsapp, condition, description } = req.body;
    
    // Validation
    if (!name || !price || !seller || !whatsapp || !condition || !description) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'Product image is required' });
    }
    
    // Validate WhatsApp number
    if (!/^91\d{10}$/.test(whatsapp)) {
      return res.status(400).json({ error: 'Invalid WhatsApp number format' });
    }
    
    const productData = {
      name: name.trim(),
      price: parseInt(price),
      seller: seller.trim(),
      whatsapp: whatsapp.trim(),
      condition,
      description: description.trim(),
      imagePath: req.file.path,
      imagePublicId: req.file.filename
    };
    
    const product = new Product(productData);
    await product.save();
    
    console.log('✅ New product saved to MongoDB:', product.name);
    res.status(201).json(product);
  } catch (error) {
    console.error('❌ Error saving product:', error);
    
    // Delete uploaded image if product save fails
    if (req.file && req.file.filename) {
      cloudinary.uploader.destroy(req.file.filename);
    }
    
    res.status(500).json({ error: 'Failed to save product' });
  }
});

// POST new product with base64 image (alternative endpoint)
app.post('/api/products/base64', async (req, res) => {
  try {
    const { name, price, seller, whatsapp, condition, description, imageBase64 } = req.body;
    
    // Validation
    if (!name || !price || !seller || !whatsapp || !condition || !description || !imageBase64) {
      return res.status(400).json({ error: 'All fields including image are required' });
    }
    
    // Validate WhatsApp number
    if (!/^91\d{10}$/.test(whatsapp)) {
      return res.status(400).json({ error: 'Invalid WhatsApp number format' });
    }
    
    // Upload base64 image to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(imageBase64, {
      folder: 'juit-olx-products',
      public_id: `product_${Date.now()}`
    });
    
    const productData = {
      name: name.trim(),
      price: parseInt(price),
      seller: seller.trim(),
      whatsapp: whatsapp.trim(),
      condition,
      description: description.trim(),
      imagePath: uploadResult.secure_url,
      imagePublicId: uploadResult.public_id
    };
    
    const product = new Product(productData);
    await product.save();
    
    console.log('✅ New product saved to MongoDB (base64):', product.name);
    res.status(201).json(product);
  } catch (error) {
    console.error('❌ Error saving product (base64):', error);
    res.status(500).json({ error: 'Failed to save product' });
  }
});

// PUT update product
app.put('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    console.log('✅ Product updated:', product.name);
    res.json(product);
  } catch (error) {
    console.error('❌ Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Delete image from Cloudinary
    if (product.imagePublicId) {
      await cloudinary.uploader.destroy(product.imagePublicId);
    }
    
    await Product.findByIdAndDelete(req.params.id);
    
    console.log('✅ Product deleted:', product.name);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments({ isActive: true });
    const totalSellers = await Product.distinct('seller').length;
    const avgPrice = await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, avgPrice: { $avg: '$price' } } }
    ]);
    
    res.json({
      totalProducts,
      totalSellers,
      averagePrice: avgPrice[0]?.avgPrice || 0
    });
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Serve static files (for frontend)
app.use(express.static('public'));

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api/`);
  console.log(`🌐 Frontend available at http://localhost:${PORT}/`);
});

// ============================================
// PACKAGE.JSON
// ============================================

/*
{
  "name": "juit-olx-backend",
  "version": "1.0.0",
  "description": "JUIT OLX Backend with MongoDB",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^7.5.0",
    "cors": "^2.8.5",
    "multer": "^1.4.5-lts.1",
    "cloudinary": "^1.40.0",
    "multer-storage-cloudinary": "^4.0.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "keywords": ["nodejs", "express", "mongodb", "juit", "olx"],
  "author": "JUIT Student",
  "license": "MIT"
}
*/

// ============================================
// .ENV FILE
// ============================================

/*
# MongoDB
MONGODB_URI=mongodb+srv://241033037:LftHfe7NhSpWRlY5@juit-olx.qu7gpby.mongodb.net/juit-olx?retryWrites=true&w=majority

# Cloudinary (for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Server
PORT=3000
NODE_ENV=development
*/