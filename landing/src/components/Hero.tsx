import { APP_URL } from '@/lib/constants'
import AnimatedHeroText from './AnimatedHeroText'

export default function Hero() {
  return (
    <section className="bg-white pt-32 pb-20 md:pt-40 md:pb-28">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-col items-center gap-12 md:flex-row md:gap-16">
          <div className="flex-1 text-center md:text-left">
            <AnimatedHeroText />
            <p className="mt-4 text-lg leading-relaxed text-gray-500 md:text-xl">
              EcomAssistant contacte vos clients sur WhatsApp, confirme les
              commandes, relance les silencieux — en darija, français et arabe.
              Vous ne perdez plus une livraison.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:items-center md:justify-start">
              <a
                href={`${APP_URL}/signup`}
                className="animate-pulse-ring relative inline-flex h-12 items-center rounded-md bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                Commencer l&apos;essai gratuit — 14 jours
              </a>
              <a
                href="#demo"
                className="inline-flex h-12 items-center rounded-md border border-gray-300 bg-white px-6 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Voir une démo
              </a>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              ✓ Aucune carte requise &nbsp;✓ Actif en moins de 10 minutes
              &nbsp;✓ Annulation à tout moment
            </p>
          </div>

          <div className="flex-1 flex justify-center md:justify-end">
            <div className="relative w-[300px] md:w-[340px]">
              <div className="rounded-[36px] border-[3px] border-gray-300 bg-white shadow-xl">
                <div className="flex items-center justify-center gap-1 pt-3 pb-2">
                  <div className="h-2 w-2 rounded-full bg-red-400" />
                  <div className="h-2 w-2 rounded-full bg-yellow-400" />
                  <div className="h-2 w-2 rounded-full bg-green-400" />
                </div>
                <div className="px-4 pb-2">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white">
                      K
                    </div>
                    <div className="text-xs font-medium text-gray-900">Karim Bensalah</div>
                  </div>
                </div>
                <div className="space-y-2 px-4 pb-4">
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-xl rounded-bl-sm bg-gray-100 px-3 py-2 text-xs text-gray-800">
                      Salam, je voulais confirmer ma commande
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl rounded-br-sm bg-brand-50 px-3 py-2 text-xs text-gray-800">
                      Salam Karim! Lkomanda dyalek &quot;Montre SmartFit Pro&quot;
                      b 13 900 DA jat. TConfirmi walla? ✅
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[70%] rounded-xl rounded-bl-sm bg-gray-100 px-3 py-2 text-xs text-gray-800">
                      Wah, confirmed! 👍
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <span className="text-[10px] text-green-600 font-medium">✓ Confirmée</span>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[90%] rounded-xl rounded-br-sm bg-brand-50 px-3 py-2 text-xs text-gray-800">
                      Merci Karim! Nta3tik numéro de tracking wakteli
                      tchhan. Baraka Allah fik! 🎉
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-2 -right-2 -z-10 h-full w-full rounded-[36px] border border-gray-100 bg-white" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
