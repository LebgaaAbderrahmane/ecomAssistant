export type DeliveryProviderKey = 'yalidine' | 'procolis' | 'maystro' | 'noest'

export type DeliveryCredentialField = 'apiId' | 'apiToken' | 'both'

export interface DeliveryProviderMeta {
  key: DeliveryProviderKey
  name: string
  logo: string | null
  available: boolean
  credentialField: DeliveryCredentialField
}

export const DELIVERY_PROVIDERS: DeliveryProviderMeta[] = [
  {
    key: 'yalidine',
    name: 'Yalidine',
    logo: '/images/providers/yalidine.png',
    available: true,
    credentialField: 'both',
  },
  {
    key: 'procolis',
    name: 'Procolis',
    logo: null,
    available: true,
    credentialField: 'both',
  },
  {
    key: 'maystro',
    name: 'Maystro',
    logo: null,
    available: true,
    credentialField: 'apiToken',
  },
  {
    key: 'noest',
    name: 'NOEST',
    logo: null,
    available: true,
    credentialField: 'both',
  },
]

export function getProviderMeta(key: DeliveryProviderKey): DeliveryProviderMeta | undefined {
  return DELIVERY_PROVIDERS.find((p) => p.key === key)
}