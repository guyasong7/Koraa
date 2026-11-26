'use client'

import { useStore } from './StoreProvider'
import styles from './ProductGrid.module.css'

export default function ProductGrid() {
  const { products, addToCart, store } = useStore()

  const handleAddToCart = (productId: string) => {
    addToCart(productId, 1)
  }

  if (!products || products.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No products available at the moment.</p>
      </div>
    )
  }

  return (
    <section className={styles.section} id="products">
      <div className={styles.container}>
        <h2 className={styles.title}>Featured Products</h2>
        <div className={styles.grid}>
          {products.map((product) => (
            <div key={product.id} className={styles.card}>
              <div className={styles.imageWrapper}>
                {product.images && product.images.length > 0 ? (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className={styles.image}
                  />
                ) : (
                  <div className={styles.imagePlaceholder}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15L16 10L5 21" />
                    </svg>
                  </div>
                )}
                {!product.is_available && (
                  <div className={styles.outOfStock}>Out of Stock</div>
                )}
              </div>

              <div className={styles.content}>
                <h3 className={styles.productName}>{product.name}</h3>
                <p className={styles.productDescription}>
                  {product.description}
                </p>

                <div className={styles.footer}>
                  <div className={styles.price}>
                    {product.price.toLocaleString()} {store.currency}
                  </div>
                  <button
                    className={styles.addButton}
                    onClick={() => handleAddToCart(product.id)}
                    disabled={!product.is_available}
                  >
                    {product.is_available ? 'Add to Cart' : 'Unavailable'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
