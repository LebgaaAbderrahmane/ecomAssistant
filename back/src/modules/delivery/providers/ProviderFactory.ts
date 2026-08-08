import { AbstractDeliveryProvider } from './AbstractDeliveryProvider.js'
import { YalidineProvider } from './YalidineProvider.js'
import { ProcolisProvider } from './ProcolisProvider.js'
import { MaystroProvider } from './MaystroProvider.js'
import { NoestProvider } from './NoestProvider.js'

export class ProviderFactory {
  static create(provider: string, merchantId: string, apiId: string, apiToken: string): AbstractDeliveryProvider {
    switch (provider) {
      case 'yalidine':
        return new YalidineProvider(merchantId, apiId, apiToken)
      case 'procolis':
        return new ProcolisProvider(merchantId, apiId, apiToken)
      case 'maystro':
        return new MaystroProvider(merchantId, apiId, apiToken)
      case 'noest':
        return new NoestProvider(merchantId, apiId, apiToken)
      default:
        throw new Error(`Unsupported delivery provider: ${provider}`)
    }
  }
}
