import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'
import { Card } from '../../components/ui/Card.js'
import { api } from '../../lib/api.js'
import { useTranslation } from 'react-i18next'

export function AgentConfig() {
  const navigate = useNavigate()
  const [language, setLanguage] = useState('auto')
  const [tone, setTone] = useState('friendly')
  const [delay1, setDelay1] = useState('2')
  const [delay2, setDelay2] = useState('24')
  const [delay3, setDelay3] = useState('48')
  const [saving, setSaving] = useState(false)
  const { t } = useTranslation('onboarding')

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/agent-config', {
        defaultLanguage: language,
        tone,
        followUpDelays: [parseInt(delay1, 10), parseInt(delay2, 10), parseInt(delay3, 10)],
      })
      navigate('/onboarding/activate')
    } catch {
      navigate('/onboarding/activate')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <h2 className="text-2xl font-bold text-on">{t('agent.title')}</h2>
      <p className="mt-1 text-sm text-on-muted">
        {t('agent.description')}
      </p>

      <Card className="mt-8 space-y-6">
        <div>
          <label className="block text-sm font-medium text-on-secondary">{t('agent.defaultLanguage')}</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-on bg-surface text-on px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="auto">{t('agent.autoDetect')}</option>
            <option value="derdja">Derdja</option>
            <option value="french">{t('agent.french')}</option>
            <option value="arabic">{t('agent.arabic')}</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-on-secondary">{t('agent.agentTone')}</label>
          <div className="mt-2 flex gap-4">
            {['friendly', 'formal'].map((val) => (
              <label key={val} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tone"
                  value={val}
                  checked={tone === val}
                  onChange={(e) => setTone(e.target.value)}
                  className="text-brand-600"
                />
                <span className="text-sm text-on-secondary">{val === 'friendly' ? t('agent.friendly') : t('agent.formal')}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input label={t('agent.followUp1')} type="number" value={delay1} onChange={(e) => setDelay1(e.target.value)} min={1} />
          <Input label={t('agent.followUp2')} type="number" value={delay2} onChange={(e) => setDelay2(e.target.value)} min={1} />
          <Input label={t('agent.followUp3')} type="number" value={delay3} onChange={(e) => setDelay3(e.target.value)} min={1} />
        </div>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} loading={saving}>
          {t('agent.continue')}
        </Button>
      </div>
    </div>
  )
}
