'use client'
import Link from 'next/link'
import Image from 'next/image'
import { Loader2, Menu, X, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import React from 'react'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react"
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"
import { dark } from '@clerk/themes'

const menuItems = [
  { name: 'Features', href: '#features' },
  { name: 'How It Works', href: '#how-it-works' },
  { name: 'Pricing', href: '#pricing' },
  { name: 'FAQ', href: '#faq' },
]

function smoothScrollTo(href: string) {
  const id = href.replace('#', '')
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export const HeroHeader = () => {
  const [menuState, setMenuState] = React.useState(false)
  const [isScrolled, setIsScrolled] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const { setTheme, resolvedTheme } = useTheme()

  const appearance = { baseTheme: resolvedTheme === "dark" ? dark : undefined }

  React.useEffect(() => {
    setMounted(true)
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header>
      <nav
        data-state={menuState && 'active'}
        className={cn(
          'fixed z-20 w-full border-b backdrop-blur-md transition-all duration-300 lm-nav',
          isScrolled ? 'py-0' : 'py-0'
        )}
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="relative flex items-center justify-between gap-6 py-3.5">
            {/* Logo */}
            <Link href="/" aria-label="home" className="flex items-center gap-2.5">
              <Image src="/brandlogo.png" alt="LeadMighty" width={32} height={32} className="rounded-lg" />
              <span className="text-lg font-bold text-slate-900 dark:text-white">LeadMighty</span>
            </Link>

            {/* Desktop nav */}
            <div className="absolute inset-0 m-auto hidden size-fit lg:block">
              <ul className="flex gap-8 text-sm">
                {menuItems.map((item) => (
                  <li key={item.name}>
                    <a
                      href={item.href}
                      onClick={(e) => { e.preventDefault(); smoothScrollTo(item.href); }}
                      className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-150 cursor-pointer"
                    >
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-3">
              {/* Theme toggle */}
              <button
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="flex size-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Toggle theme"
              >
                {mounted && (resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />)}
              </button>

              <AuthLoading>
                <Loader2 className="size-5 animate-spin text-slate-400" />
              </AuthLoading>
              <Authenticated>
                <Button asChild size="sm">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
                <UserButton appearance={appearance} />
              </Authenticated>
              <Unauthenticated>
                <SignInButton mode="modal">
                  <Button variant="ghost" size="sm" className="hidden lg:inline-flex text-slate-600 dark:text-slate-400">
                    Log in
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    Get Started
                  </Button>
                </SignUpButton>
              </Unauthenticated>

              {/* Mobile hamburger */}
              <button
                onClick={() => setMenuState(!menuState)}
                aria-label="Toggle menu"
                className="lg:hidden relative -mr-1 p-2 text-slate-600 dark:text-slate-400"
              >
                <Menu className={cn("size-5 transition-all", menuState && "opacity-0 scale-0")} />
                <X className={cn("size-5 absolute inset-0 m-auto transition-all", menuState ? "opacity-100 scale-100" : "opacity-0 scale-0")} />
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {menuState && (
            <div className="border-t lm-divider pb-6 pt-4 lg:hidden">
              <ul className="space-y-4">
                {menuItems.map((item) => (
                  <li key={item.name}>
                    <a
                      href={item.href}
                      onClick={(e) => { e.preventDefault(); setMenuState(false); smoothScrollTo(item.href); }}
                      className="block text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
