const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  location: { type: String, required: true },
  type: { type: String, required: true, default: 'Tam Zamanlı' },
  description: { type: String, required: true },
  quota: { type: Number, default: 20 },
  appliedCount: { type: Number, default: 0 },
  image: { type: String, default: '' },
  date: { type: Date, default: Date.now },
  category: { type: String, default: 'Mühendislik' },
  
  // YENİ: İlana özel şartlar alanı (zengin içerik)
  requirements: {
    type: [String],  // Array of requirement strings
    default: [
      'İlgili alanda minimum 2 yıl tecrübe',
      'Almanya çalışma kültürüne uyum sağlayabilme vizyonu',
      'B1/B2 seviyesinde dil yeterliliği (Pozisyona göre değişebilir)',
      'Takım çalışmasına yatkınlık ve çözüm odaklı yaklaşım'
    ]
  },
  
  // YENİ: Özel yetkinlikler (JSON formatında detaylı)
  skills: {
    required: [{ type: String }],
    preferred: [{ type: String }]
  },
  
  // YENİ: Yan haklar
  benefits: [{ type: String }],
  
  // YENİ: Çalışma saatleri
  workingHours: { type: String, default: '09:00 - 18:00 (Hafta içi)' },
  
  // YENİ: Eğitim gereksinimi
  educationLevel: { type: String, default: 'Lisans' },
  
  // YENİ: Dil gereksinimleri
  languageRequirements: {
    german: { level: { type: String, default: 'B1' }, required: { type: Boolean, default: true } },
    english: { level: { type: String, default: 'B1' }, required: { type: Boolean, default: false } }
  },
  
  // YENİ: Deneyim yılı
  experienceYears: { type: Number, default: 2 }
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);