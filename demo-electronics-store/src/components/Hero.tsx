'use client'

import { useStore } from './StoreProvider'
import styles from './Hero.module.css'

export default function Hero() {
  const { store } = useStore()

  return (
    <section className={styles.hero}>
      <div className={styles.container}>
        <div className={styles.content}>
          <h1 className={styles.title}>
            Welcome to {store.name}
          </h1>
          <p className={styles.description}>
            {store.description || 'Discover the latest electronics and gadgets at unbeatable prices.'}
          </p>
          <div className={styles.actions}>
            <a href="#products" className={styles.primaryButton}>
              Shop Now
            </a>
            <a href="#categories" className={styles.secondaryButton}>
              Browse Categories
            </a>
          </div>
        </div>
        <div className={styles.imageWrapper}>
          <div className={styles.imagePlaceholder}>
            <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  )
}
