const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware (Çakışmaları önlemek ve dış bağlantılara izin vermek için)
app.use(cors());
app.use(express.json());

// Test Rotası
app.get('/', (req, res) => {
    res.send('Kariyer Almanya API Başarıyla Çalışıyor!');
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda ayağa kalktı. Kariyer Almanya projesi başlıyor!`);
});