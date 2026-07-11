import { useTranslation } from 'react-i18next';

export function Billing() {
  const { t } = useTranslation('billing');
  return (
    <div>
      <h1 className="text-2xl font-bold text-on">{t('title')}</h1>
      <p className="mt-1 text-sm text-on-muted">{t('subtitle')}</p>

      <div className="mt-6 rounded-lg border border-on bg-surface p-[20px_24px]">
        <p className="text-sm text-on-muted">{t('section')}</p>
      </div>
    </div>
  )
}
