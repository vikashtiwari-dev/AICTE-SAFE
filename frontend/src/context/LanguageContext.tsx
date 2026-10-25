import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'en' | 'hi';

interface Translations {
  [key: string]: {
    en: string;
    hi: string;
  };
}

export const translations: Translations = {
  // Navigation
  dashboard: { en: 'Executive Dashboard', hi: 'कार्यकारी डैशबोर्ड' },
  fdr_repository: { en: 'FDR Repository', hi: 'सुरक्षा जमा / एफडीआर रिपॉजिटरी' },
  institutions: { en: 'Institutions', hi: 'तकनीकी संस्थान' },
  alerts_validity: { en: 'Alerts & Validity', hi: 'वैधता एवं अनुपालन अलर्ट' },
  release_requests: { en: 'Release Requests', hi: 'रिलीज़ एवं रिफंड प्रक्रिया' },
  reports_audits: { en: 'Reports & Audits', hi: 'ऑडिट एवं वित्तीय विश्लेषण' },
  menu: { en: 'Menu', hi: 'मेनू' },
  sign_out: { en: 'Sign Out', hi: 'साइन आउट' },

  // Top Bar & App Header
  safe_engine: { en: 'AICTE SAFE • Regulation Bureau', hi: 'एआईसीटीई सेफ • विनियमन ब्यूरो' },
  govt_ministry: { en: 'Regulation Bureau, Ministry of Education, Govt. of India', hi: 'विनियमन ब्यूरो, शिक्षा मंत्रालय, भारत सरकार' },
  app_subtitle: { en: 'Secure Automated FDR & Deposit Engine', hi: 'सुरक्षित स्वचालित एफडीआर एवं जमा इंजन' },

  // Status & Badges
  active: { en: 'Active', hi: 'सक्रिय' },
  expiring_soon: { en: 'Expiring Soon', hi: 'शीघ्र समाप्त' },
  matured: { en: 'Matured', hi: 'परिपक्व' },
  verified: { en: 'Verified', hi: 'सत्यापित' },
  discrepancy: { en: 'Discrepancy', hi: 'विसंगति' },
  pending: { en: 'Pending', hi: 'लंबित' },

  // Stats & Metrics
  total_deposits: { en: 'Total Locked Deposits', hi: 'कुल आरक्षित सुरक्षा जमा' },
  active_instruments: { en: 'Active Instruments', hi: 'सक्रिय बैंक गारंटी एवं एफडीआर' },
  compliance_health: { en: 'APH Compliance Score', hi: 'एपीएच अनुपालन स्वास्थ्य स्कोर' },
  multi_channel_nudges: { en: 'Multi-Channel Nudges', hi: 'व्हाट्सएप / एसएमएस अलर्ट' },
  dispute_resolution: { en: 'Dispute & Scrutiny Module', hi: 'विवाद एवं विसंगति निवारण' },
  ocr_extract: { en: 'AI / OCR Auto-Extract', hi: 'एआई / ओसीआर स्वचालित निष्कर्षण' },
  ifsc_verify: { en: 'RBI IFSC Verified', hi: 'आरबीआई आईएफएससी सत्यापित' },
  dsc_sign: { en: 'Digital Signature (DSC)', hi: 'डिजिटल हस्ताक्षर (डीएससी)' }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en');

  const t = (key: string): string => {
    if (translations[key] && translations[key][language]) {
      return translations[key][language];
    }
    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
