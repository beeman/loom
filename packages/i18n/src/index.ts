import './resources.d.ts'
import './i18next.d.ts'

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enTranslation from '../locales/en/translation.json' with { type: 'json' }
import enUi from '../locales/en/ui.json' with { type: 'json' }
import esTranslation from '../locales/es/translation.json' with { type: 'json' }
import esUi from '../locales/es/ui.json' with { type: 'json' }

i18n.use(initReactI18next).init({
  defaultNS: 'translation',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  lng: 'en',
  resources: {
    en: {
      translation: enTranslation,
      ui: enUi,
    },
    es: {
      translation: esTranslation,
      ui: esUi,
    },
  },
})

export { useTranslation } from 'react-i18next'

export { i18n }
