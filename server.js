const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files directly from root directory
app.use(express.static(__dirname));

// Uploads ফোল্ডার চেক করা (রুট ফোল্ডারে)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// SQLite ডাটাবেজ সেটআপ
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`, () => {
            db.get(`SELECT value FROM settings WHERE key = 'images'`, (err, row) => {
                if (!row) {
                    const defaultImages = JSON.stringify([
                        "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=600&q=80"
                    ]);
                    db.run(`INSERT INTO settings (key, value) VALUES ('images', ?)`, [defaultImages]);
                }
            });
            db.get(`SELECT value FROM settings WHERE key = 'ads'`, (err, row) => {
                if (!row) {
                    const defaultAds = JSON.stringify({ smartlink: "", banner: "", popunder: "" });
                    db.run(`INSERT INTO settings (key, value) VALUES ('ads', ?)`, [defaultAds]);
                }
            });
        });
    }
});

// Multer কনফিগারেশন
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// API: সব ডাটা ফেচ করা
app.get('/api/data', (req, res) => {
    db.all(`SELECT * FROM settings`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let data = { images: [], ads: {} };
        rows.forEach(row => {
            if (row.key === 'images') data.images = JSON.parse(row.value);
            if (row.key === 'ads') data.ads = JSON.parse(row.value);
        });
        res.json(data);
    });
});

// API: ছবি আপলোড করা
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const imageUrl = `/uploads/${req.file.filename}`;
    db.get(`SELECT value FROM settings WHERE key = 'images'`, (err, row) => {
        let images = row ? JSON.parse(row.value) : [];
        images.push(imageUrl);

        db.run(`UPDATE settings SET value = ? WHERE key = 'images'`, [JSON.stringify(images)], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, images });
        });
    });
});

// API: ছবি ডিলিট করা
app.post('/api/delete-image', (req, res) => {
    const { index } = req.body;
    db.get(`SELECT value FROM settings WHERE key = 'images'`, (err, row) => {
        if (!row) return res.status(400).json({ error: 'No images found' });

        let images = JSON.parse(row.value);
        if (index >= 0 && index < images.length) {
            const imgPath = images[index];
            if (imgPath.startsWith('/uploads/')) {
                const fullPath = path.join(__dirname, imgPath);
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            }
            images.splice(index, 1);

            db.run(`UPDATE settings SET value = ? WHERE key = 'images'`, [JSON.stringify(images)], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, images });
            });
        } else {
            res.status(400).json({ error: 'Invalid index' });
        }
    });
});

// API: অ্যাড সেভ করা
app.post('/api/save-ads', (req, res) => {
    const { smartlink, banner, popunder } = req.body;
    const adsData = JSON.stringify({ smartlink, banner, popunder });

    db.run(`UPDATE settings SET value = ? WHERE key = 'ads'`, [adsData], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, ads: { smartlink, banner, popunder } });
    });
});

// রুট রাউট (হোম পেজ)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// অ্যাডমিন পেজ রাউট
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
