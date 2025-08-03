const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// GitHub configuration
const GITHUB_CONFIG = {
    owner: 'Pushkarmehra',
    repo: 'DEMO-JUIT-OLX-2',
    branch: 'main',
    token: process.env.API_KEY
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// Utility function to make GitHub API requests
async function githubRequest(endpoint, options = {}) {
    const url = `https://api.github.com${endpoint}`;
    const defaultOptions = {
        headers: {
            'Authorization': `token ${GITHUB_CONFIG.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        }
    };
    
    const requestOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    try {
        const response = await fetch(url, requestOptions);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('GitHub API request failed:', error);
        throw error;
    }
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'JUIT OLX API is running',
        timestamp: new Date().toISOString()
    });
});

// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const endpoint = `/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/products.json`;
        
        try {
            const file = await githubRequest(endpoint);
            const products = JSON.parse(Buffer.from(file.content, 'base64').toString());
            
            res.json({
                success: true,
                products: products,
                source: 'github'
            });
        } catch (error) {
            // If products.json doesn't exist, return demo products
            console.log('Products file not found, returning demo data');
            
            const demoProducts = [
                {
                    id: 1,
                    name: "Gaming Laptop RTX 3060",
                    price: 85000,
                    seller: "Alex Kumar",
                    whatsapp: "919876543210",
                    condition: "Like New",
                    description: "High-performance gaming laptop with RTX 3060 graphics card, perfect for gaming and development work.",
                    imagePath: "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=500&h=300&fit=crop",
                    dateAdded: new Date().toISOString()
                },
                {
                    id: 2,
                    name: "Study Table with Storage",
                    price: 4500,
                    seller: "Priya Singh",
                    whatsapp: "919876543211",
                    condition: "Good",
                    description: "Wooden study desk with multiple drawers, perfect for dorm rooms and study spaces.",
                    imagePath: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=300&fit=crop",
                    dateAdded: new Date().toISOString()
                },
                {
                    id: 3,
                    name: "Mountain Bike Trek",
                    price: 25000,
                    seller: "Rahul Sharma",
                    whatsapp: "919876543212",
                    condition: "Excellent",
                    description: "Trek mountain bike in excellent condition, perfect for campus rides and weekend adventures.",
                    imagePath: "https://images.unsplash.com/photo-1544191696-15693072ce6b?w=500&h=300&fit=crop",
                    dateAdded: new Date().toISOString()
                }
            ];
            
            res.json({
                success: true,
                products: demoProducts,
                source: 'demo'
            });
        }
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products',
            error: error.message
        });
    }
});

// Upload image to GitHub
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        // Generate unique filename
        const timestamp = Date.now();
        const extension = path.extname(req.file.originalname);
        const filename = `product_${timestamp}${extension}`;
        const imagePath = `images/${filename}`;

        // Convert buffer to base64
        const base64Content = req.file.buffer.toString('base64');

        // Upload to GitHub
        const endpoint = `/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${imagePath}`;
        const uploadData = {
            message: `Add product image: ${filename}`,
            content: base64Content,
            branch: GITHUB_CONFIG.branch
        };

        const result = await githubRequest(endpoint, {
            method: 'PUT',
            body: JSON.stringify(uploadData)
        });

        res.json({
            success: true,
            imageUrl: result.content.download_url,
            filename: filename
        });

    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload image',
            error: error.message
        });
    }
});

// Add new product
app.post('/api/products', async (req, res) => {
    try {
        const { name, price, seller, whatsapp, condition, description, imageUrl } = req.body;

        // Validate required fields
        if (!name || !price || !seller || !whatsapp || !condition || !description || !imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Validate WhatsApp number format
        if (!/^91\d{10}$/.test(whatsapp)) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp number should start with 91 followed by 10 digits'
            });
        }

        // Get current products
        let currentProducts = [];
        let sha = null;

        try {
            const endpoint = `/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/products.json`;
            const file = await githubRequest(endpoint);
            currentProducts = JSON.parse(Buffer.from(file.content, 'base64').toString());
            sha = file.sha;
        } catch (error) {
            // File doesn't exist yet, start with empty array
            console.log('Products file not found, creating new one');
        }

        // Create new product
        const newProduct = {
            id: Date.now(),
            name: name.trim(),
            price: parseInt(price),
            seller: seller.trim(),
            whatsapp: whatsapp.trim(),
            condition,
            description: description.trim(),
            imagePath: imageUrl,
            dateAdded: new Date().toISOString()
        };

        // Add to beginning of array
        currentProducts.unshift(newProduct);

        // Save to GitHub
        const content = JSON.stringify(currentProducts, null, 2);
        const base64Content = Buffer.from(content).toString('base64');

        const updateData = {
            message: `Add new product: ${newProduct.name}`,
            content: base64Content,
            branch: GITHUB_CONFIG.branch
        };

        if (sha) {
            updateData.sha = sha;
        }

        const endpoint = `/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/products.json`;
        await githubRequest(endpoint, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });

        res.json({
            success: true,
            message: 'Product added successfully',
            product: newProduct
        });

    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add product',
            error: error.message
        });
    }
});

// Search products
app.get('/api/products/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        // Get all products first
        const productsResponse = await fetch(`${req.protocol}://${req.get('host')}/api/products`);
        const productsData = await productsResponse.json();
        
        if (!productsData.success) {
            throw new Error('Failed to fetch products');
        }

        // Filter products based on search query
        const searchTerm = q.toLowerCase().trim();
        const filteredProducts = productsData.products.filter(product => 
            product.name.toLowerCase().includes(searchTerm) ||
            product.description.toLowerCase().includes(searchTerm) ||
            product.seller.toLowerCase().includes(searchTerm) ||
            product.condition.toLowerCase().includes(searchTerm)
        );

        res.json({
            success: true,
            products: filteredProducts,
            query: q,
            count: filteredProducts.length
        });

    } catch (error) {
        console.error('Error searching products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search products',
            error: error.message
        });
    }
});

// Delete product (optional - for admin use)
app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);

        // Get current products
        const endpoint = `/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/products.json`;
        const file = await githubRequest(endpoint);
        const currentProducts = JSON.parse(Buffer.from(file.content, 'base64').toString());

        // Find and remove product
        const productIndex = currentProducts.findIndex(p => p.id === productId);
        
        if (productIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const deletedProduct = currentProducts.splice(productIndex, 1)[0];

        // Save updated products
        const content = JSON.stringify(currentProducts, null, 2);
        const base64Content = Buffer.from(content).toString('base64');

        const updateData = {
            message: `Delete product: ${deletedProduct.name}`,
            content: base64Content,
            branch: GITHUB_CONFIG.branch,
            sha: file.sha
        };

        await githubRequest(endpoint, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });

        res.json({
            success: true,
            message: 'Product deleted successfully',
            deletedProduct
        });

    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete product',
            error: error.message
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size too large. Maximum size is 5MB.'
            });
        }
    }
    
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 JUIT OLX API Server running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🛍️  Products API: http://localhost:${PORT}/api/products`);
    
    // Verify environment variables
    if (!process.env.API_KEY) {
        console.warn('⚠️  WARNING: API_KEY not found in environment variables');
    } else {
        console.log('✅ GitHub API key loaded successfully');
    }
});

module.exports = app;