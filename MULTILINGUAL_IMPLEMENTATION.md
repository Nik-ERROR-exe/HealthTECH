# HealthTECH Multilingual Implementation Guide

## Overview
Your HealthTECH application now supports Hindi (हिंदी) and Marathi (मराठी) in addition to English. This guide explains what was implemented and how to use it.

## ✅ What Was Implemented

### 1. **Backend Translation Service**
- **File**: `backend/app/services/translation_service.py`
- **Library**: TextBlob (free, no API keys needed)
- **Features**:
  - Translate text between English, Hindi, and Marathi
  - Batch translate lists of strings
  - Translate specific dictionary keys
  - Automatic error handling with fallback to original text

### 2. **Frontend i18n Setup**
- **File**: `frontend/src/lib/i18n.ts`
- **Libraries**: i18next + react-i18next + i18next-browser-languagedetector
- **Features**:
  - Auto-detect browser language
  - Remember user's language preference in localStorage
  - Support for en, hi, mr languages

### 3. **Translation Files (JSON)**
Created complete translation files for all UI text:
- `frontend/public/locales/en/translation.json` - English
- `frontend/public/locales/hi/translation.json` - Hindi
- `frontend/public/locales/mr/translation.json` - Marathi

Translated sections:
- Header & Navigation
- Chat interface
- Patient/Doctor/Volunteer dashboards
- Authentication pages
- Emergency alerts
- Common UI elements

### 4. **Language Switcher Component**
- **File**: `frontend/src/components/LanguageSwitcher.tsx`
- **Features**:
  - Dropdown selector for language change
  - Flags 🇬🇧 🇮🇳
  - Real-time language switching

### 5. **Updated Conversation API**
- **File**: `backend/app/routers/conversation.py`
- **Endpoints Updated**:
  - `POST /patient/conversation/start?language=hi` - Multilingual greeting & questions
  - `POST /patient/conversation/{session_id}/answer` - Translate user responses and AI questions
  
**Features**:
- Accept language parameter (en, hi, mr)
- Translate questions and options to user's language
- Translate user's response back to English for AI processing
- Translate final health assessment message

### 6. **Database Updates**
- Added `language` column to `AgentSession` model
- Stores user's preferred language for the session

## 🚀 Installation & Setup

### Frontend Setup
```bash
cd frontend
npm install
```

The following packages are now in `package.json`:
- `i18next@^24.0.0`
- `react-i18next@^15.0.0`
- `i18next-browser-languagedetector@^8.0.0`

### Backend Setup
```bash
cd backend
pip install textblob
```

Or update your requirements:
```bash
pip install -r requirements.txt
```

TextBlob has been added to `requirements.txt`

## 📱 How to Use

### 1. **Language Selection in Frontend**
Add the LanguageSwitcher component to your navbar:

```tsx
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export const Navbar = () => {
  return (
    <nav>
      {/* Your navbar content */}
      <LanguageSwitcher />
    </nav>
  );
};
```

### 2. **Use Translations in Components**
```tsx
import { useTranslation } from 'react-i18next';

export const MyComponent = () => {
  const { t, i18n } = useTranslation();
  
  return (
    <div>
      <h1>{t('patient.dashboard')}</h1>
      <p>{t('chat.welcome')}</p>
      <button onClick={() => i18n.changeLanguage('hi')}>
        Switch to Hindi
      </button>
    </div>
  );
};
```

### 3. **Start Conversation with Language**
```typescript
// From frontend (AgentChat.tsx)
const response = await fetch('/patient/conversation/start?language=hi', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### 4. **Submit Answer with Language**
```typescript
const response = await fetch(`/patient/conversation/${sessionId}/answer`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    question_id: 'q1',
    answer: 'मुझे बुखार है', // In Hindi
    language: 'hi'
  })
});
```

## 🎤 Speech Recognition & Text-to-Speech

### Supported Languages
- **English**: en-US
- **Hindi**: hi-IN
- **Marathi**: mr-IN

The AgentChat component already handles language-specific voice:

```typescript
const languageToCode = (lang: string): string => {
  const map: Record<string, string> = {
    en: 'en-US',
    hi: 'hi-IN',
    mr: 'mr-IN',
  };
  return map[lang] || 'en-US';
};
```

## 🌍 Translation Flow

### Patient Experience
1. User opens app → Browser detects language or shows language selector
2. User selects Hindi/Marathi
3. Frontend shows all UI in selected language
4. User clicks "Start Conversation" → Backend sends greeting in Hindi/Marathi
5. User answers questions in Hindi/Marathi (or via speech recognition)
6. Backend processes answers:
   - Translates user's response to English
   - Sends through AI agents for analysis
   - Returns result in Hindi/Marathi
7. Final health assessment is shown in user's language

## 📊 Database Schema

### AgentSession Model
```python
class AgentSession(Base):
    __tablename__ = "agent_sessions"
    
    id = Column(String(36), primary_key=True)
    patient_id = Column(String(36), ForeignKey("patient_profiles.id"))
    language = Column(String(5), default="en")  # NEW: Language preference
    status = Column(String(20), default="active")
    conversation = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    # ... other fields
```

## 🔧 API Contract Changes

### Updated Endpoints

#### POST /patient/conversation/start
**Query Parameters**:
```
?language=hi  # Optional, defaults to 'en'
```

**Response**:
```json
{
  "session_id": "uuid",
  "greeting": "नमस्ते! आप आज कैसे महसूस कर रहे हैं?",
  "first_question": {
    "id": "q1",
    "question": "क्या आपको बुखार है?",
    "type": "yes_no",
    "options": ["हाँ", "नहीं"]
  },
  "language": "hi"
}
```

#### POST /patient/conversation/{session_id}/answer
**Request**:
```json
{
  "question_id": "q1",
  "answer": "हाँ",
  "language": "hi"
}
```

**Response** (if conversation continues):
```json
{
  "status": "ok",
  "next_question": {
    "id": "q2",
    "question": "बुखार कितने दिन से है?",
    "type": "text"
  },
  "language": "hi"
}
```

**Response** (if conversation ends):
```json
{
  "status": "success",
  "risk_tier": "YELLOW",
  "friendly_message": "आपके लक्षणों को देखते हुए आपके डॉक्टर को सूचित किया जा रहा है...",
  "language": "hi"
}
```

## 🛠️ Troubleshooting

### Issue: Translations not loading
**Solution**: Clear browser localStorage and reload
```javascript
localStorage.clear();
location.reload();
```

### Issue: TextBlob translation not working
**Cause**: TextBlob needs internet connection for translation
**Solution**: Check network connectivity or consider adding offline fallback

```python
# Optional: Add offline translation dictionary
OFFLINE_TRANSLATIONS = {
    'hi': {
        'fever': 'बुखार',
        'cough': 'खांसी',
    }
}
```

### Issue: Missing language in speech recognition
**Solution**: Windows 10+ has built-in Hindi and Marathi voices
- **Windows**: Settings → Speech → Language preferences
- **Mac**: System Preferences → Accessibility → Speech
- **Web**: Uses system voices available

## 📝 Adding More Translations

To add more strings:

1. **Add to all three JSON files**:
```json
{
  "doctor": {
    "newField": "English text"
  }
}
```

2. **Hindi version**:
```json
{
  "doctor": {
    "newField": "हिंदी पाठ"
  }
}
```

3. **Marathi version**:
```json
{
  "doctor": {
    "newField": "मराठी मजकूर"
  }
}
```

4. **Use in component**:
```tsx
const { t } = useTranslation();
<span>{t('doctor.newField')}</span>
```

## 🔐 Security Notes

- Translation service uses TextBlob (free, no API key needed)
- All user responses are captured in original language
- Backend translates to English only for internal processing
- User's language preference is stored in session

## 📚 Files Modified/Created

### Created Files:
- ✅ `backend/app/services/translation_service.py`
- ✅ `frontend/src/lib/i18n.ts`
- ✅ `frontend/src/components/LanguageSwitcher.tsx`
- ✅ `frontend/public/locales/en/translation.json`
- ✅ `frontend/public/locales/hi/translation.json`
- ✅ `frontend/public/locales/mr/translation.json`

### Modified Files:
- ✅ `frontend/src/main.tsx` - Added i18n initialization
- ✅ `frontend/package.json` - Added i18n packages
- ✅ `backend/requirements.txt` - Added textblob
- ✅ `backend/app/routers/conversation.py` - Added language support to endpoints

## 🎯 Next Steps

1. **Run Frontend Installation**:
   ```bash
   cd frontend && npm install
   ```

2. **Run Backend Installation**:
   ```bash
   cd backend && pip install -r requirements.txt
   ```

3. **Test with Frontend**:
   - Add LanguageSwitcher to your Navbar
   - Test language switching
   - Test chat with different languages

4. **Optional Enhancements**:
   - Add more translations to JSON files
   - Implement language preference in user profile
   - Add custom translation missing warnings in development
   - Set up professional translation service (if needed)

## 📞 Support

For issues or enhancements:
- Check TextBlob documentation: https://textblob.readthedocs.io/
- Check i18next documentation: https://www.i18next.com/
- Supported languages in TextBlob: 100+ languages

---

**Implementation Date**: April 22, 2026
**Status**: ✅ Complete and Ready for Testing
