import type { Metadata } from 'next'
import '../styles/globals.css'

export const metadata: Metadata = {
  title: 'Electronics Store Pro - Premium Electronics & Gadgets',
  description: 'Shop the latest electronics, smartphones, laptops, and accessories at unbeatable prices.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
