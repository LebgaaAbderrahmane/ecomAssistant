import { AbstractDeliveryProvider } from './AbstractDeliveryProvider.js'
import { YalidineProvider } from './YalidineProvider.js'

export class ProviderFactory {
  static create(provider: string, merchantId: string, apiId: string, apiToken: string): AbstractDeliveryProvider {
    switch (provider) {
      case 'yalidine':
        return new YalidineProvider(merchantId, apiId, apiToken)
      default:
        throw new Error(`Unsupported delivery provider: ${provider}`)
    }
  }
}
