'use client'

import { useState, useEffect } from 'react'
import { APP_URL } from '@/lib/constants'

const navLinks = [
  { label: 'Fonctionnalités', href: '#features' },
  { label: 'Tarifs', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 bg-white transition-shadow ${
        scrolled ? 'shadow-sm' : ''
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <a href="#" className="flex items-center gap-2.5">
          <img src="/ecomAssistantLogo.svg" alt="EcomAssistant" className="h-8 w-8" />
          <span className="text-lg font-semibold text-gray-900">EcomAssistant</span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`${APP_URL}/login`}
            className="hidden text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors sm:inline"
          >
            Se connecter
          </a>
          <a
            href={`${APP_URL}/signup`}
            className="inline-flex h-10 items-center rounded-md bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            Essai gratuit
          </a>
        </div>
      </div>
    </nav>
  )
}
