'use client'

import { useStore } from './StoreProvider'
import styles from './Header.module.css'

export default function Header() {
  const { store, getCartCount } = useStore()

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.logo}>
          {store.logo ? (
            <img src={store.logo} alt={store.name} className={styles.logoImage} />
          ) : (
            <span className={styles.logoText}>{store.name}</span>
          )}
        </div>

        <nav className={styles.nav}>
          <a href="#products" className={styles.navLink}>Products</a>
          <a href="#categories" className={styles.navLink}>Categories</a>
          <a href="#about" className={styles.navLink}>About</a>
        </nav>

        <div className={styles.actions}>
          <button className={styles.cartButton}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 2L7 6H3L6 20H18L21 6H17L15 2H9Z" />
              <path d="M9 10V14M15 10V14" />
            </svg>
            {getCartCount() > 0 && (
              <span className={styles.cartBadge}>{getCartCount()}</span>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
