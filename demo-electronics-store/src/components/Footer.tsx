'use client'

import { useStore } from './StoreProvider'
import styles from './Footer.module.css'

export default function Footer() {
  const { store } = useStore()

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.grid}>
          <div className={styles.column}>
            <h3 className={styles.columnTitle}>{store.name}</h3>
            <p className={styles.description}>
              {store.description || 'Your trusted source for quality electronics and gadgets.'}
            </p>
          </div>

          <div className={styles.column}>
            <h3 className={styles.columnTitle}>Quick Links</h3>
            <ul className={styles.linkList}>
              <li><a href="#products" className={styles.link}>Products</a></li>
              <li><a href="#categories" className={styles.link}>Categories</a></li>
              <li><a href="#about" className={styles.link}>About Us</a></li>
              <li><a href="#contact" className={styles.link}>Contact</a></li>
            </ul>
          </div>

          <div className={styles.column}>
            <h3 className={styles.columnTitle}>Customer Service</h3>
            <ul className={styles.linkList}>
              <li><a href="#shipping" className={styles.link}>Shipping Info</a></li>
              <li><a href="#returns" className={styles.link}>Returns</a></li>
              <li><a href="#faq" className={styles.link}>FAQ</a></li>
              <li><a href="#support" className={styles.link}>Support</a></li>
            </ul>
          </div>

          <div className={styles.column}>
            <h3 className={styles.columnTitle}>Contact</h3>
            <ul className={styles.linkList}>
              <li className={styles.contactItem}>
                <span>Domain: {store.domain}</span>
              </li>
              <li className={styles.contactItem}>
                <span>Currency: {store.currency}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copyright}>
            © {new Date().getFullYear()} {store.name}. All rights reserved.
          </p>
          <p className={styles.poweredBy}>
            Powered by <strong>Koraa</strong>
          </p>
        </div>
      </div>
    </footer>
  )
}
