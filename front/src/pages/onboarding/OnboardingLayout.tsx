import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function OnboardingLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation('onboarding')
  const steps = [
    { path: '/onboarding/store', label: t('layout.store') },
    { path: '/onboarding/whatsapp', label: 'WhatsApp' },
    { path: '/onboarding/agent', label: t('layout.agent') },
    { path: '/onboarding/activate', label: t('layout.activation') },
  ]
  const currentStep = steps.findIndex((s) => s.path === location.pathname)
  const progress = ((currentStep + 1) / steps.length) * 100

  return (
    <div className="flex min-h-screen flex-col bg-surface-secondary">
      <div className="border-b border-on bg-surface">
        <div className="mx-auto max-w-3xl px-8 pt-4 pb-6">
          <div className="mb-8 flex items-center justify-center">
            {steps.map((step, index) => (
              <div key={step.path} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                      index < currentStep
                        ? 'bg-brand-600 text-white'
                        : index === currentStep
                          ? 'border-2 border-brand-600 bg-surface text-brand-600'
                          : 'border-2 border-on bg-surface text-on-faint'
                    }`}
                  >
                    {index < currentStep ? <Check className="h-4 w-4" /> : index + 1}
                  </div>
                  <span
                    className={`hidden text-sm font-medium sm:inline ${
                      index <= currentStep ? 'text-on' : 'text-on-faint'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className="mx-4 h-px w-16 bg-gray-300 sm:w-24">
                    <div
                      className="h-full bg-brand-600 transition-all"
                      style={{ width: `${index < currentStep ? 100 : 0}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
