import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import fr from './locales/fr/common.json'
import frLayout from './locales/fr/layout.json'
import frOrders from './locales/fr/orders.json'
import frCustomers from './locales/fr/customers.json'
import frCatalog from './locales/fr/catalog.json'
import frDashboard from './locales/fr/dashboard.json'
import frEscalations from './locales/fr/escalations.json'
import frNotifications from './locales/fr/notifications.json'
import frSettings from './locales/fr/settings.json'
import frProfile from './locales/fr/profile.json'
import frBilling from './locales/fr/billing.json'
import frAuth from './locales/fr/auth.json'
import frOnboarding from './locales/fr/onboarding.json'

import en from './locales/en/common.json'
import enLayout from './locales/en/layout.json'
import enOrders from './locales/en/orders.json'
import enCustomers from './locales/en/customers.json'
import enCatalog from './locales/en/catalog.json'
import enDashboard from './locales/en/dashboard.json'
import enEscalations from './locales/en/escalations.json'
import enNotifications from './locales/en/notifications.json'
import enSettings from './locales/en/settings.json'
import enProfile from './locales/en/profile.json'
import enBilling from './locales/en/billing.json'
import enAuth from './locales/en/auth.json'
import enOnboarding from './locales/en/onboarding.json'

import ar from './locales/ar/common.json'
import arLayout from './locales/ar/layout.json'
import arOrders from './locales/ar/orders.json'
import arCustomers from './locales/ar/customers.json'
import arCatalog from './locales/ar/catalog.json'
import arDashboard from './locales/ar/dashboard.json'
import arEscalations from './locales/ar/escalations.json'
import arNotifications from './locales/ar/notifications.json'
import arSettings from './locales/ar/settings.json'
import arProfile from './locales/ar/profile.json'
import arBilling from './locales/ar/billing.json'
import arAuth from './locales/ar/auth.json'
import arOnboarding from './locales/ar/onboarding.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: {
        common: fr,
        layout: frLayout,
        orders: frOrders,
        customers: frCustomers,
        catalog: frCatalog,
        dashboard: frDashboard,
        escalations: frEscalations,
        notifications: frNotifications,
        settings: frSettings,
        profile: frProfile,
        billing: frBilling,
        auth: frAuth,
        onboarding: frOnboarding,
      },
      en: {
        common: en,
        layout: enLayout,
        orders: enOrders,
        customers: enCustomers,
        catalog: enCatalog,
        dashboard: enDashboard,
        escalations: enEscalations,
        notifications: enNotifications,
        settings: enSettings,
        profile: enProfile,
        billing: enBilling,
        auth: enAuth,
        onboarding: enOnboarding,
      },
      ar: {
        common: ar,
        layout: arLayout,
        orders: arOrders,
        customers: arCustomers,
        catalog: arCatalog,
        dashboard: arDashboard,
        escalations: arEscalations,
        notifications: arNotifications,
        settings: arSettings,
        profile: arProfile,
        billing: arBilling,
        auth: arAuth,
        onboarding: arOnboarding,
      },
    },
    fallbackLng: 'fr',
    defaultNS: 'common',
    ns: ['common', 'layout', 'orders', 'customers', 'catalog', 'dashboard', 'escalations', 'notifications', 'settings', 'profile', 'billing', 'auth', 'onboarding'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
