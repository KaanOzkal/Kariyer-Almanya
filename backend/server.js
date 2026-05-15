// YENİ: dotenv EN ÜSTE ALINDI! (Şifreler ve Port önceden okunmak zorunda)
require('dotenv').config(); 

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
// PORT artık .env dosyasından güvenle okunabilir
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());

// 1. Uploads klasörünü dışarıya aç
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 2. React Build klasörünü dışarıya aç (Render üzerinde frontend servisi için)
app.use(express.static(path.join(__dirname, 'build')));

// ============================================
// DOSYA VE VERİTABANI KONTROLLERİ
// ============================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const DB_FILE = path.join(__dirname, 'data.json');
const JOBS_FILE = path.join(__dirname, 'jobs.json');

const initializeFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]', 'utf8');
        return [];
    }
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (!content || content.trim() === '') {
            fs.writeFileSync(filePath, '[]', 'utf8');
            return [];
        }
        const data = JSON.parse(content);
        if (!Array.isArray(data)) {
            fs.writeFileSync(filePath, '[]', 'utf8');
            return [];
        }
        return data;
    } catch (e) {
        console.error(`Dosya okuma hatası (${filePath}):`, e.message);
        fs.writeFileSync(filePath, '[]', 'utf8');
        return [];
    }
};

initializeFile(DB_FILE);
initializeFile(JOBS_FILE);

// Güvenli okuma/yazma fonksiyonları
const readData = (file) => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        if (!content || content.trim() === '') return [];
        const data = JSON.parse(content);
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.error(`Okuma hatası (${file}):`, e.message);
        return [];
    }
};

const writeData = (file, data) => {
    try {
        const dataToWrite = Array.isArray(data) ? data : [];
        fs.writeFileSync(file, JSON.stringify(dataToWrite, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error(`Yazma hatası (${file}):`, e.message);
        return false;
    }
};

// ============================================
// MULTER (DOSYA YÜKLEME) AYARLARI
// ============================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]/g, '_');
        cb(null, Date.now() + '-' + safeName + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Desteklenmeyen dosya tipi'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: fileFilter
});

// ============================================
// NODEMAILER (GMAIL) AYARLARI
// ============================================
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS  
    }
});

// ============================================
// 1. BAŞVURU ROTALARI 
// ============================================

app.post('/api/apply', upload.array('documents', 5), async (req, res) => {
    try {
        const { fullname, email, phone, message, category, job_title, jobTitle, job_id, jobId, careerLevel } = req.body;
        const files = req.files || [];
        const fileNames = files.map(f => f.filename);
        
        let finalJobId = job_id || jobId;
        let finalJobTitle = job_title || jobTitle;

        // İlan adı yoksa ID'den bul
        if (finalJobId && (!finalJobTitle || finalJobTitle === 'Belirtilmemiş')) {
            const jobs = readData(JOBS_FILE);
            const foundJob = jobs.find(j => j.id === parseInt(finalJobId));
            if (foundJob) {
                finalJobTitle = foundJob.title;
            }
        }
        
        console.log('📝 Yeni başvuru:', { fullname, email, job_title: finalJobTitle });
        
        // 1. ADIM: JSON VERİTABANINA KAYDET
        const newApp = { 
            id: Date.now(),
            fullname: fullname || 'İsimsiz',
            email: email || '',
            phone: phone || '',
            message: message || '',
            category: category || 'Genel',
            careerLevel: careerLevel || 'Belirtilmemiş',
            job_title: finalJobTitle || 'Belirtilmemiş',
            job_id: finalJobId ? parseInt(finalJobId) : null,
            files: fileNames,
            status: 'bekliyor',
            note: '',
            cv_path: fileNames.find(f => f.toLowerCase().includes('cv') || f.toLowerCase().includes('resume')) || fileNames[0] || null,
            date: new Date().toISOString()
        };
        
        const data = readData(DB_FILE);
        data.push(newApp);
        writeData(DB_FILE, data);

        // İlan sayacını güncelle
        if (finalJobId) {
            const jobs = readData(JOBS_FILE);
            const jobIndex = jobs.findIndex(j => j.id === parseInt(finalJobId));
            if (jobIndex !== -1) {
                jobs[jobIndex].appliedCount = (jobs[jobIndex].appliedCount || 0) + 1;
                writeData(JOBS_FILE, jobs);
            }
        }

        // 2. ADIM: E-POSTA İLE GÖNDER
        try {
            const attachments = files.map(file => ({
                filename: file.originalname,
                path: file.path
            }));

            const mailOptions = {
                from: process.env.GMAIL_USER,
                to: 'ozkalkaan490@gmail.com', 
                subject: `BERLINER Yeni İş Başvurusu: ${newApp.fullname} - ${newApp.job_title}`,
                text: `
Sistemden yeni bir başvuru aldınız!

👤 Aday Bilgileri:
---------------------------
Ad Soyad: ${newApp.fullname}
E-posta: ${newApp.email}
Telefon: ${newApp.phone}

🎯 Başvuru Detayları:
---------------------------
Kategori: ${newApp.category}
İlan: ${newApp.job_title}
Kariyer Seviyesi: ${newApp.careerLevel}

💬 Mesaj/Not:
---------------------------
${newApp.message || 'Mesaj bırakılmadı.'}

📎 Belgeler (CV vb.) bu maile ek olarak (attachment) eklenmiştir ve sunucuya yedeklenmiştir.
                `,
                attachments: attachments
            };

            await transporter.sendMail(mailOptions);
            console.log("✅ E-posta başarıyla gönderildi!");
        } catch (mailError) {
            console.error("⚠️ Mail iletilemedi ama başvuru sisteme kaydedildi:", mailError.message);
        }

        // Mail gitse de gitmese de kullanıcı başarılı ekranını görür
        res.status(200).json({ message: 'Başvuru alındı!', application: newApp });

    } catch (error) { 
        console.error('Apply hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası: ' + error.message }); 
    }
});

// ============================================
// DİĞER ROTALAR
// ============================================

app.get('/api/applications', (req, res) => {
    try {
        const data = readData(DB_FILE);
        data.sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: 'Veri okuma hatası' });
    }
});

app.put('/api/applications/:id/status', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status } = req.body;
        let data = readData(DB_FILE);
        const index = data.findIndex(app => app.id === id);
        if (index !== -1) {
            data[index].status = status;
            writeData(DB_FILE, data);
            res.json({ message: 'Durum güncellendi!', application: data[index] });
        } else {
            res.status(404).json({ message: 'Başvuru bulunamadı' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Hata oluştu: ' + error.message });
    }
});

app.put('/api/applications/:id/note', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { note } = req.body;
        if (note === undefined) return res.status(400).json({ message: 'Not içeriği gereklidir' });
        
        let data = readData(DB_FILE);
        const index = data.findIndex(app => app.id === id);
        if (index !== -1) {
            data[index].note = note;
            data[index].noteUpdatedAt = new Date().toISOString();
            writeData(DB_FILE, data);
            res.json({ message: 'Not kaydedildi!', application: { id: data[index].id, note: data[index].note }});
        } else {
            res.status(404).json({ message: 'Başvuru bulunamadı' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Hata oluştu: ' + error.message });
    }
});

app.delete('/api/applications/:id/note', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        let data = readData(DB_FILE);
        const index = data.findIndex(app => app.id === id);
        if (index !== -1) {
            data[index].note = '';
            data[index].noteUpdatedAt = new Date().toISOString();
            writeData(DB_FILE, data);
            res.json({ message: 'Not silindi!' });
        } else {
            res.status(404).json({ message: 'Başvuru bulunamadı' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Hata oluştu: ' + error.message });
    }
});

app.delete('/api/applications/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        let data = readData(DB_FILE);
        const filtered = data.filter(app => app.id !== id);
        if (filtered.length !== data.length) {
            writeData(DB_FILE, filtered);
            res.json({ message: 'Başvuru silindi!' });
        } else {
            res.status(404).json({ message: 'Başvuru bulunamadı' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Hata oluştu' });
    }
});

app.post('/api/jobs', upload.single('image'), (req, res) => {
    try {
        const { title, location, type, description, quota, category, workingHours, educationLevel, experienceYears, requirements, skills, benefits, languageRequirements } = req.body;
        const image = req.file ? req.file.filename : null;

        let parsedRequirements = [], parsedSkills = {}, parsedBenefits = [], parsedLanguageRequirements = {};
        try {
            if (requirements) parsedRequirements = JSON.parse(requirements);
            if (skills) parsedSkills = JSON.parse(skills);
            if (benefits) parsedBenefits = JSON.parse(benefits);
            if (languageRequirements) parsedLanguageRequirements = JSON.parse(languageRequirements);
        } catch (e) { }

        const newJob = {
            id: Date.now(),
            title: title || 'Yeni Pozisyon', location: location || 'Almanya', type: type || 'Tam Zamanlı',
            description: description || 'Açıklama yok.', quota: parseInt(quota) || 10, appliedCount: 0,
            category: category || 'Mühendislik', image: image, date: new Date().toISOString(),
            workingHours: workingHours || 'Belirtilmemiş', educationLevel: educationLevel || 'Lisans',
            experienceYears: parseInt(experienceYears) || 2, requirements: parsedRequirements,
            skills: parsedSkills, benefits: parsedBenefits, languageRequirements: parsedLanguageRequirements
        };
        
        let jobs = readData(JOBS_FILE);
        jobs.push(newJob);
        writeData(JOBS_FILE, jobs);
        res.status(200).json({ message: 'İlan eklendi!', job: newJob });
    } catch (error) { 
        res.status(500).json({ message: 'Hata oluştu: ' + error.message }); 
    }
});

app.get('/api/jobs', (req, res) => {
    try {
        let jobs = readData(JOBS_FILE);
        jobs.sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ message: 'Veri okuma hatası', jobs: [] });
    }
});

app.get('/api/jobs/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const job = readData(JOBS_FILE).find(j => j.id === id);
        if (job) res.json(job);
        else res.status(404).json({ message: 'İlan bulunamadı' });
    } catch (error) {
        res.status(500).json({ message: 'Hata oluştu' });
    }
});

app.put('/api/jobs/:id', upload.single('image'), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        let jobs = readData(JOBS_FILE);
        const index = jobs.findIndex(j => j.id === id);
        
        if (index !== -1) {
            const keys = ['title', 'location', 'type', 'description', 'quota', 'category', 'workingHours', 'educationLevel', 'experienceYears'];
            keys.forEach(k => { if (req.body[k]) jobs[index][k] = req.body[k] });
            
            try {
                if (req.body.requirements) jobs[index].requirements = JSON.parse(req.body.requirements);
                if (req.body.skills) jobs[index].skills = JSON.parse(req.body.skills);
                if (req.body.benefits) jobs[index].benefits = JSON.parse(req.body.benefits);
                if (req.body.languageRequirements) jobs[index].languageRequirements = JSON.parse(req.body.languageRequirements);
            } catch (e) { }
            
            if (req.file) jobs[index].image = req.file.filename;
            writeData(JOBS_FILE, jobs);
            res.json({ message: 'İlan güncellendi!', job: jobs[index] });
        } else {
            res.status(404).json({ message: 'İlan bulunamadı' });
        }
    } catch (error) { 
        res.status(500).json({ message: 'Hata oluştu: ' + error.message }); 
    }
});

app.delete('/api/jobs/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        let jobs = readData(JOBS_FILE);
        jobs = jobs.filter(j => j.id !== id);
        writeData(JOBS_FILE, jobs);
        res.json({ message: 'İlan silindi!' });
    } catch (error) {
        res.status(500).json({ message: 'Hata oluştu' });
    }
});

app.get('/api/download/:filename', (req, res) => {
    try {
        const filePath = path.join(uploadDir, req.params.filename);
        if (fs.existsSync(filePath)) res.download(filePath);
        else res.status(404).send('Dosya bulunamadı');
    } catch (error) {
        res.status(500).send('İndirme hatası');
    }
});

app.get('/api/stats', (req, res) => {
    try {
        const applications = readData(DB_FILE);
        const jobs = readData(JOBS_FILE);
        const stats = {
            totalApplications: applications.length,
            pendingApplications: applications.filter(a => a.status === 'bekliyor').length,
            approvedApplications: applications.filter(a => a.status === 'onaylandı').length,
            rejectedApplications: applications.filter(a => a.status === 'reddedildi').length,
            totalJobs: jobs.length,
            activeJobs: jobs.filter(j => (j.appliedCount || 0) < (j.quota || 10)).length,
            totalApplicationsByJob: jobs.map(j => ({ id: j.id, title: j.title, count: j.appliedCount || 0, quota: j.quota || 10 }))
        };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ message: 'İstatistik alınamadı' });
    }
});

// ============================================
// REACT YÖNLENDİRMESİ (DÜZELTİLDİ: '*' kullanıldı)
// ============================================
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'build', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Frontend build klasörü bulunamadı. Lütfen 'npm run build' yapıp build klasörünü server.js yanına koyun.");
    }
});

app.use((err, req, res, next) => {
    console.error('Genel hata:', err.stack);
    res.status(500).json({ message: 'Bir şeyler ters gitti!', error: err.message });
});

// ============================================
// SERVER BAŞLATMA
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Sunucu başarıyla çalışıyor!`);
    console.log(`📍 Adres: https://kariyer-almanya.onrender.com`);
    console.log(`📁 Uploads klasörü: ${uploadDir}`);
    console.log(`💾 Veritabanı dosyaları: data.json, jobs.json`);
    
    const jobsCheck = readData(JOBS_FILE);
    console.log(`📊 Mevcut ilan sayısı: ${Array.isArray(jobsCheck) ? jobsCheck.length : 0}`);
});