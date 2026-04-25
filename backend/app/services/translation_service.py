"""
Translation Service using TextBlob for multilingual support
Supports: English (en), Hindi (hi), Marathi (mr)
"""
import logging
from typing import List, Optional
from deep_translator import GoogleTranslator

logger = logging.getLogger(__name__)


class TranslationService:
    """Handles translation between English and Indian languages"""
    
    SUPPORTED_LANGUAGES = ['en', 'hi', 'mr']
    
    def translate_text(self, text: str, target_language: str, from_lang: Optional[str] = None) -> str:
        """
        Translate text to target language
        
        Args:
            text: Text to translate
            target_language: Target language code ('en', 'hi', 'mr')
            from_lang: Optional source language code
            
        Returns:
            Translated text or original if error occurs or if already in target language
        """
        if not text or target_language not in self.SUPPORTED_LANGUAGES:
            return text
        
        # If already in target language, skip translation
        if from_lang == target_language:
            return text
        
        try:
            # deep-translator's GoogleTranslator is very stable
            translated = GoogleTranslator(source='auto', target=target_language).translate(text)
            return translated
        except Exception as e:
            logger.error(f"Translation error for '{text}' to {target_language}: {e}")
            return text
    
    def translate_list(self, texts: List[str], target_language: str) -> List[str]:
        """
        Translate a list of strings
        
        Args:
            texts: List of texts to translate
            target_language: Target language code
            
        Returns:
            List of translated texts
        """
        return [self.translate_text(text, target_language) for text in texts]
    
    def translate_dict(self, data: dict, target_language: str, keys_to_translate: List[str]) -> dict:
        """
        Translate specific keys in a dictionary
        
        Args:
            data: Dictionary containing data
            target_language: Target language code
            keys_to_translate: List of keys whose values should be translated
            
        Returns:
            Dictionary with translated values
        """
        result = data.copy()
        for key in keys_to_translate:
            if key in result:
                result[key] = self.translate_text(result[key], target_language)
        return result


# Singleton instance
translation_service = TranslationService()
