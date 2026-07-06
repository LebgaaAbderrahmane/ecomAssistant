import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface MobileMenuContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
}

const MobileMenuContext = createContext<MobileMenuContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
})

export function MobileMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  return (
    <MobileMenuContext.Provider value={{ isOpen, open, close }}>
      {children}
    </MobileMenuContext.Provider>
  )
}

export function useMobileMenu() {
  return useContext(MobileMenuContext)
}
