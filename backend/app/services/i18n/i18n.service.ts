import { 
  SupportedLanguage, 
  TranslationKey, 
  I18nService as I18nServiceInterface,
  I18nConfig,
  TranslationKeys
} from './i18n.types.js';
import { en } from './locales/en.js';
import { de } from './locales/de.js';
import { logger } from '../../common/utils/logger.util.js';
import { appConfig } from '../../config/app.config.js';

export class I18nService implements I18nServiceInterface {
  private translations: Record<SupportedLanguage, TranslationKeys> = {
    en,
    de,
  };
  
  private currentLanguage: SupportedLanguage;
  private config: I18nConfig = {
    defaultLanguage: 'en',
    fallbackLanguage: 'en',
    supportedLanguages: ['en', 'de'],
  };

  constructor(language?: SupportedLanguage) {
    this.currentLanguage = language || this.config.defaultLanguage;
  }

  /**
   * Translate a key to the current language
   * Supports parameter interpolation with {{param}} syntax
   */
  t = (key: TranslationKey, params?: Record<string, any>): string => {
    try {
      // Get translation from current language
      let translation = this.translations[this.currentLanguage][key];
      
      // Fallback to default language if not found
      if (!translation && this.currentLanguage !== this.config.fallbackLanguage) {
        translation = this.translations[this.config.fallbackLanguage][key];
        logger.warn(`Translation missing for key "${key}" in language "${this.currentLanguage}"`);
      }
      
      // If still not found, return the key itself
      if (!translation) {
        logger.error(`Translation missing for key "${key}" in all languages`);
        return key;
      }
      
      // Replace parameters; {{appName}} (APP_NAME) is always available
      const values: Record<string, unknown> = { appName: appConfig.name, ...params };
      Object.entries(values).forEach(([param, value]) => {
        translation = translation.replace(new RegExp(`{{${param}}}`, 'g'), String(value));
      });
      
      return translation;
    } catch (error) {
      logger.error('Translation error', { error, key, language: this.currentLanguage });
      return key;
    }
  };

  /**
   * Set the current language
   */
  setLanguage(lang: SupportedLanguage): void {
    if (this.isSupported(lang)) {
      this.currentLanguage = lang;
    } else {
      logger.warn(`Unsupported language "${lang}", using default`);
      this.currentLanguage = this.config.defaultLanguage;
    }
  }

  /**
   * Get the current language
   */
  getLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * Check if a language is supported
   */
  isSupported(lang: string): boolean {
    return this.config.supportedLanguages.includes(lang as SupportedLanguage);
  }

  /**
   * Create a new instance with a specific language
   */
  withLanguage(lang: SupportedLanguage): I18nService {
    return new I18nService(lang);
  }

  /**
   * Get language from Accept-Language header
   */
  static getLanguageFromHeader(acceptLanguage?: string): SupportedLanguage {
    if (!acceptLanguage) return 'en';
    
    // Parse Accept-Language header (e.g., "de-DE,de;q=0.9,en;q=0.8")
      const languages = acceptLanguage
      .split(',')
      .map(lang => {
        const parts = lang.trim().split(';q=');
        const code = parts[0] || '';
        const q = parts[1] || '1';
        return { code: code.toLowerCase(), quality: parseFloat(q) };
      })
      .sort((a, b) => b.quality - a.quality);
    
    // Find first supported language
    for (const { code } of languages) {
      if (!code) continue;
      const parts = code.split('-');
      const langCode = parts[0] || ''; // Get language without region
      if (langCode && ['en', 'de'].includes(langCode)) {
        return langCode as SupportedLanguage;
      }
    }
    
    return 'en'; // Default fallback
  }
}

// Export singleton for default language
export const i18n = new I18nService();
