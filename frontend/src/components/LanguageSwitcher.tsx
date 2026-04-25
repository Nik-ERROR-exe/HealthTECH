import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  // Use resolvedLanguage to handle en-US -> en matching
  const currentLang = i18n.resolvedLanguage || i18n.language || 'en';

  return (
    <Select value={currentLang.split('-')[0]} onValueChange={(lng) => i18n.changeLanguage(lng)}>
      <SelectTrigger className="w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">🇬🇧 English</SelectItem>
        <SelectItem value="hi">🇮🇳 हिंदी</SelectItem>
        <SelectItem value="mr">🇮🇳 मराठी</SelectItem>
      </SelectContent>
    </Select>
  );
};
