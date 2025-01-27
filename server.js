const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; // For async file operations
const app = express();

// Update path constants to use Render's tmp directory in production
const UPLOADS_DIR = process.env.NODE_ENV === 'production' 
    ? '/tmp/uploads'
    : path.join(__dirname, 'uploads');

const DATA_DIR = process.env.NODE_ENV === 'production'
    ? '/tmp/data'
    : path.join(__dirname, 'data');

const VENDORS_FILE = path.join(DATA_DIR, 'vendors.json');

// Ensure data directory exists
const ensureDataDir = async () => {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
    
    // Create vendors.json if it doesn't exist
    try {
        await fs.access(VENDORS_FILE);
    } catch {
        await fs.writeFile(VENDORS_FILE, JSON.stringify([]));
    }

    // Ensure uploads directory exists
    try {
        await fs.access(UPLOADS_DIR);
    } catch {
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
    }
};

// Initialize data directory and file
ensureDataDir();

// Add this function after ensureDataDir
async function cleanupOldImages() {
    try {
        // First ensure the directories exist
        await ensureDataDir();
        
        // Get yesterday's date in YYYY-MM-DD format
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // Read vendors data
        const vendors = await readVendorsData();
        
        // Check if uploads directory exists before trying to read it
        try {
            // Get list of all files in uploads directory
            const files = await fs.readdir(UPLOADS_DIR);
            
            // Filter out today's images
            const todayVendors = vendors.filter(v => v.uploadDate === new Date().toISOString().split('T')[0]);
            const todayImages = new Set(todayVendors.map(v => path.basename(v.imageUrl)));
            
            // Delete old files
            for (const file of files) {
                // Skip if file is used in today's menus
                if (todayImages.has(file)) continue;
                
                const filePath = path.join(UPLOADS_DIR, file);
                try {
                    await fs.unlink(filePath);
                    console.log(`Deleted old image: ${file}`);
                } catch (unlinkError) {
                    console.error(`Error deleting file ${file}:`, unlinkError);
                }
            }
        } catch (readDirError) {
            // If uploads directory doesn't exist or can't be read, just log it
            console.log('No uploads directory found or empty, skipping cleanup');
        }

        // Update vendors.json to remove old entries
        const updatedVendors = vendors.filter(v => v.uploadDate === new Date().toISOString().split('T')[0]);
        await writeVendorsData(updatedVendors);
        
    } catch (error) {
        console.error('Error cleaning up old images:', error);
    }
}

// Run cleanup at startup and every 24 hours
cleanupOldImages();
setInterval(cleanupOldImages, 24 * 60 * 60 * 1000);

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
    destination: async function(req, file, cb) {
        try {
            await fs.access(UPLOADS_DIR);
        } catch {
            await fs.mkdir(UPLOADS_DIR, { recursive: true });
        }
        cb(null, UPLOADS_DIR);
    },
    filename: function(req, file, cb) {
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
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/', (req, res) => {
    console.log('Serving user.html');
    res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// Route for vendor upload page (index.html)
app.get('/vendor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for user view page (user.html)

// Add this after your existing constants
const AUTHORIZED_VENDORS = [
    {
        pin: "123456",
        name: "Cafeteria One",
        id: "V001"
    },
    {
        pin: "234567",
        name: "Food Corner",
        id: "V002"
    },
    {
        pin: "345678",
        name: "Lunch Box",
        id: "V003"
    },
    {
        pin: "456789",
        name: "Spice Garden",
        id: "V004"
    },
    {
        pin: "567890",
        name: "Fresh Bites",
        id: "V005"
    }
];

// Add this route before your upload route
app.post('/verify-pin', express.json(), async (req, res) => {
    const { pin } = req.body;

    if (!pin || pin.length !== 6) {
        return res.json({ 
            success: false, 
            message: 'Invalid PIN format' 
        });
    }

    const vendor = AUTHORIZED_VENDORS.find(v => v.pin === pin);

    if (!vendor) {
        return res.json({ 
            success: false, 
            message: 'Unauthorized vendor' 
        });
    }

    res.json({ 
        success: true, 
        vendorName: vendor.name,
        vendorId: vendor.id
    });
});

// Modify your upload route to include vendor verification
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
            
            // Verify vendor exists
            const vendor = AUTHORIZED_VENDORS.find(v => v.name === vendorName);
            if (!vendor) {
                return res.json({ error: 'Unauthorized vendor' });
            }

            const imageFilename = req.file.filename;
            const uploadTime = new Date().toLocaleTimeString();

            // Read existing vendors data
            let vendors = await readVendorsData();
            
            // Find if vendor exists and update, or add new vendor
            const vendorIndex = vendors.findIndex(v => v.vendorName === vendorName);
            const vendorData = {
                vendorName,
                vendorId: vendor.id,
                imageUrl: `/uploads/${imageFilename}`,
                uploadTime,
                uploadDate: new Date().toISOString().split('T')[0]
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