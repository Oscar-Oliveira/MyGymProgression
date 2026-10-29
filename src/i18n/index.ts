import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { pt } from './pt';

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pt: { translation: pt } },
  lng: navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

export default i18n;
