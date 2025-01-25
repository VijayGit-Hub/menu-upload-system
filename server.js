const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; // For async file operations
const app = express();

// Path to our vendors data file
const VENDORS_FILE = path.join(__dirname, 'data', 'vendors.json');

// Ensure data directory exists
const ensureDataDir = async () => {
    const dataDir = path.join(__dirname, 'data');
    try {
        await fs.access(dataDir);
    } catch {
        await fs.mkdir(dataDir);
    }
    
    // Create vendors.json if it doesn't exist
    try {
        await fs.access(VENDORS_FILE);
    } catch {
        await fs.writeFile(VENDORS_FILE, JSON.stringify([]));
    }
};

// Initialize data directory and file
ensureDataDir();

// Function to read vendors data
async function readVendorsData() {
    try {
        const data = await fs.readFile(VENDORS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading vendors data:', error);
        return [];
    }
}

// Function to write vendors data
async function writeVendorsData(data) {
    try {
        await fs.writeFile(VENDORS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing vendors data:', error);
    }
}

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function(req, file, cb) {
        // Log the incoming file details
        console.log('Uploading file:', {
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size
        });
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10000000 }, // 10MB limit
    fileFilter: function(req, file, cb) {
        checkFileType(file, cb);
    }
}).single('menuImage');

// Check file type
function checkFileType(file, cb) {
    // Allowed extensions
    const filetypes = /jpeg|jpg|png|gif|webp/;
    // Check extension
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime type
    const mimetype = filetypes.test(file.mimetype);

    console.log('File type check:', {
        filename: file.originalname,
        mimetype: file.mimetype,
        isValidExtension: extname,
        isValidMimeType: mimetype
    });

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Images Only!');
    }
}

// Serve static files from public directory

// Serve uploaded files from uploads directory
app.use('/uploads', express.static('uploads'));

app.get('/', (req, res) => {
    console.log('Serving user.html');
    res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// Route for vendor upload page (index.html)
app.get('/vendor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for user view page (user.html)


// Modified upload handler to save vendor data
app.post('/upload', (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error('Upload error:', err);
            return res.json({ error: err.message || err });
        }

        if (!req.file) {
            return res.json({ error: 'No file selected!' });
        }

        try {
            const vendorName = req.body.vendorName;
            const imageFilename = req.file.filename;
            const uploadTime = new Date().toLocaleTimeString();

            // Read existing vendors data
            let vendors = await readVendorsData();
            
            // Find if vendor exists and update, or add new vendor
            const vendorIndex = vendors.findIndex(v => v.vendorName === vendorName);
            const vendorData = {
                vendorName,
                imageUrl: `/uploads/${imageFilename}`,
                uploadTime,
                uploadDate: new Date().toISOString().split('T')[0] // Store date for filtering
            };

            if (vendorIndex >= 0) {
                vendors[vendorIndex] = vendorData;
            } else {
                vendors.push(vendorData);
            }

            // Save updated vendors data
            await writeVendorsData(vendors);

            res.json({
                success: true,
                file: `uploads/${imageFilename}`,
                vendorData
            });
        } catch (error) {
            console.error('Error saving vendor data:', error);
            res.json({ error: 'Error saving vendor data' });
        }
    });
});

// Modified API endpoint to get today's menus from JSON file
app.get('/api/menus', async (req, res) => {
    try {
        const vendors = await readVendorsData();
        const today = new Date().toISOString().split('T')[0];
        
        // Filter for today's menus only
        const todayMenus = vendors.filter(vendor => 
            vendor.uploadDate === today
        );

        res.json(todayMenus);
    } catch (error) {
        console.error('Error fetching menus:', error);
        res.status(500).json({ error: 'Error fetching menus' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));